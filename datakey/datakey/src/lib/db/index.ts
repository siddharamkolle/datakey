import fs from "fs";
import path from "path";
import postgres from "postgres";
import {
  DEFAULT_PUBLIC_PROFILE,
  DEFAULT_VISIBILITY_SETTINGS,
  type EmergencyContact,
  type PublicCustomLink,
  type PublicEmergencyProfile,
  type PublicVisibilitySettings,
} from "@/lib/vault/vaultState";

export type DbDriver = "sqlite" | "turso" | "postgres";

export interface VaultMetaRow {
  id: string;
  salt: string;
  server_salt: string;
  auth_verifier_hash: string;
  wrapped_vek_pass: string;
  iv_pass: string;
  kdf_iterations: number;
  recov_verifier_hash: string | null;
  wrapped_vek_recov: string | null;
  iv_recov: string | null;
  session_secret: string;
  key_version: number;
  created_at: string;
  updated_at: string;
}

export interface VaultRecordRow {
  record_id: string;
  category: string;
  folder_id: string | null;
  ciphertext: string;
  salt: string;
  nonce: string;
  auth_tag: string;
  key_version: number;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinderTransmissionRow {
  id: string;
  public_token: string;
  message: string;
  finder_contact: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_denied: number;
  created_at: string;
}

type SqlParam = string | number | null;

// -----------------------------------------------------------------------------
// Driver Detection (100% Free, Zero-Subscription Options)
// 1. Turso Cloud SQLite (TURSO_DATABASE_URL) - free tier, zero credit card
// 2. PostgreSQL (DATABASE_URL) - Neon / Supabase / Render / Railway / local Postgres
// 3. Built-in Node SQLite (data/datakey.db) - default zero-config database!
// -----------------------------------------------------------------------------

export function getActiveDbDriver(): DbDriver {
  if (process.env.TURSO_DATABASE_URL) return "turso";
  if (process.env.DATABASE_URL) return "postgres";
  return "sqlite";
}

// Singleton connections & initialization promise
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqliteInstance: any = null;
let pgInstance: ReturnType<typeof postgres> | null = null;
let initPromise: Promise<void> | null = null;

function getSqliteDb() {
  if (sqliteInstance) return sqliteInstance;
  const dbPath =
    process.env.DATAKEY_DB_PATH ||
    path.join(process.cwd(), "data", "datakey.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const getBuiltin = (process as unknown as {
    getBuiltinModule?: (id: string) => { DatabaseSync?: new (p: string) => unknown };
  }).getBuiltinModule;
  const sqliteMod = getBuiltin?.("node:sqlite");
  if (!sqliteMod?.DatabaseSync) {
    throw new Error(
      "Built-in SQLite requires Node.js 22.5+ (or set TURSO_DATABASE_URL / DATABASE_URL for a free cloud DB)."
    );
  }
  const db = new sqliteMod.DatabaseSync(dbPath) as { exec: (s: string) => void; prepare: (s: string) => unknown };
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  sqliteInstance = db;
  return db;
}

function getPgClient() {
  if (pgInstance) return pgInstance;
  const connStr = process.env.DATABASE_URL!;
  pgInstance = postgres(connStr, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return pgInstance;
}

function normalizeSqlParams(params: SqlParam[]): SqlParam[] {
  return params.map((p) => (p === undefined ? null : p));
}

function toPgPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

async function tursoPipeline(
  requests: Array<{ sql: string; params?: SqlParam[] }>
): Promise<Array<Record<string, unknown>[]>> {
  const rawUrl = process.env.TURSO_DATABASE_URL!;
  const httpUrl = rawUrl.replace(/^libsql:\/\//i, "https://").replace(/\/$/, "");
  const authToken = process.env.TURSO_AUTH_TOKEN || "";

  const body = {
    requests: [
      ...requests.map((r) => ({
        type: "execute",
        stmt: {
          sql: r.sql,
          args: (r.params || []).map((val) => {
            if (val === null || val === undefined) return { type: "null" };
            if (typeof val === "number") {
              return Number.isInteger(val)
                ? { type: "integer", value: String(val) }
                : { type: "float", value: val };
            }
            return { type: "text", value: String(val) };
          }),
        },
      })),
      { type: "close" },
    ],
  };

  const res = await fetch(`${httpUrl}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Turso HTTP error (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as {
    results: Array<{
      type: string;
      error?: { message: string };
      response?: {
        result?: {
          cols: Array<{ name: string }>;
          rows: Array<Array<{ type: string; value?: string | number | null }>>;
        };
      };
    }>;
  };

  const outputs: Array<Record<string, unknown>[]> = [];
  for (let i = 0; i < requests.length; i++) {
    const item = json.results[i];
    if (item.type === "error" || item.error) {
      throw new Error(`Turso SQL error: ${item.error?.message || "Unknown error"}`);
    }
    const result = item.response?.result;
    if (!result) {
      outputs.push([]);
      continue;
    }
    const cols = result.cols.map((c) => c.name);
    const rows = result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, cIdx) => {
        const cell = row[cIdx];
        if (!cell || cell.type === "null") {
          obj[col] = null;
        } else if (cell.type === "integer") {
          obj[col] = Number(cell.value);
        } else if (cell.type === "float") {
          obj[col] = Number(cell.value);
        } else {
          obj[col] = cell.value ?? null;
        }
      });
      return obj;
    });
    outputs.push(rows);
  }

  return outputs;
}

async function rawQuery<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = []
): Promise<T[]> {
  const cleanParams = normalizeSqlParams(params);
  const driver = getActiveDbDriver();

  if (driver === "turso") {
    const [rows] = await tursoPipeline([{ sql, params: cleanParams }]);
    return rows as T[];
  }

  if (driver === "postgres") {
    const pg = getPgClient();
    const pgSql = toPgPlaceholders(sql);
    const rows = await pg.unsafe(pgSql, cleanParams);
    return Array.from(rows) as T[];
  }

  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA")) {
    return stmt.all(...cleanParams) as T[];
  }
  stmt.run(...cleanParams);
  return [];
}

async function rawExecSchema(statements: string[]): Promise<void> {
  const driver = getActiveDbDriver();
  if (driver === "turso") {
    await tursoPipeline(statements.map((sql) => ({ sql })));
    return;
  }
  if (driver === "postgres") {
    const pg = getPgClient();
    for (const sql of statements) {
      await pg.unsafe(sql);
    }
    return;
  }
  const db = getSqliteDb();
  for (const sql of statements) {
    db.exec(sql);
  }
}

export async function ensureDbInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS vault_meta (
        id TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        server_salt TEXT NOT NULL,
        auth_verifier_hash TEXT NOT NULL,
        wrapped_vek_pass TEXT NOT NULL,
        iv_pass TEXT NOT NULL,
        kdf_iterations INTEGER NOT NULL DEFAULT 600000,
        recov_verifier_hash TEXT,
        wrapped_vek_recov TEXT,
        iv_recov TEXT,
        session_secret TEXT NOT NULL,
        key_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS public_profile (
        id TEXT PRIMARY KEY,
        public_token TEXT NOT NULL UNIQUE,
        lost_mode INTEGER NOT NULL DEFAULT 0,
        lost_banner_title TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        tagline TEXT NOT NULL,
        bio TEXT NOT NULL,
        location_label TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        masked_phone TEXT NOT NULL,
        public_email TEXT NOT NULL,
        blood_group TEXT NOT NULL,
        allergies TEXT NOT NULL,
        critical_medical_notes TEXT NOT NULL,
        emergency_instructions TEXT NOT NULL,
        custom_links_json TEXT NOT NULL,
        contacts_json TEXT NOT NULL,
        visibility_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS vault_records (
        record_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        folder_id TEXT,
        ciphertext TEXT NOT NULL,
        salt TEXT NOT NULL,
        nonce TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        key_version INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_vault_records_category ON vault_records(category)`,
      `CREATE TABLE IF NOT EXISTS vault_file_chunks (
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data_base64 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (file_id, chunk_index)
      )`,
      `CREATE TABLE IF NOT EXISTS finder_transmissions (
        id TEXT PRIMARY KEY,
        public_token TEXT NOT NULL,
        message TEXT NOT NULL,
        finder_contact TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        accuracy_meters DOUBLE PRECISION,
        location_denied INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
    ];

    await rawExecSchema(statements);

    // Ensure default public_profile row exists
    const existing = await rawQuery<{ id: string }>(
      "SELECT id FROM public_profile WHERE id = ?",
      ["owner"]
    );

    if (existing.length === 0) {
      const now = new Date().toISOString();
      await rawQuery(
        `INSERT INTO public_profile (
          id, public_token, lost_mode, lost_banner_title,
          owner_name, tagline, bio, location_label, avatar_url,
          masked_phone, public_email, blood_group, allergies,
          critical_medical_notes, emergency_instructions,
          custom_links_json, contacts_json, visibility_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "owner",
          DEFAULT_PUBLIC_PROFILE.public_token,
          0,
          DEFAULT_PUBLIC_PROFILE.lost_banner_title,
          DEFAULT_PUBLIC_PROFILE.owner_name,
          DEFAULT_PUBLIC_PROFILE.tagline,
          DEFAULT_PUBLIC_PROFILE.bio,
          DEFAULT_PUBLIC_PROFILE.location_label,
          DEFAULT_PUBLIC_PROFILE.avatar_url,
          DEFAULT_PUBLIC_PROFILE.masked_owner_phone,
          DEFAULT_PUBLIC_PROFILE.public_email,
          DEFAULT_PUBLIC_PROFILE.blood_group,
          DEFAULT_PUBLIC_PROFILE.allergies,
          DEFAULT_PUBLIC_PROFILE.critical_medical_notes,
          DEFAULT_PUBLIC_PROFILE.emergency_instructions,
          JSON.stringify(DEFAULT_PUBLIC_PROFILE.custom_links),
          JSON.stringify(DEFAULT_PUBLIC_PROFILE.emergency_contacts),
          JSON.stringify(DEFAULT_VISIBILITY_SETTINGS),
          now,
        ]
      );
    }
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

// -----------------------------------------------------------------------------
// Vault Meta Operations
// -----------------------------------------------------------------------------
export async function getVaultMeta(): Promise<VaultMetaRow | null> {
  await ensureDbInitialized();
  const rows = await rawQuery<VaultMetaRow>(
    "SELECT * FROM vault_meta WHERE id = ?",
    ["owner"]
  );
  return rows[0] || null;
}

export async function createVaultMeta(meta: VaultMetaRow): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `INSERT INTO vault_meta (
      id, salt, server_salt, auth_verifier_hash, wrapped_vek_pass, iv_pass,
      kdf_iterations, recov_verifier_hash, wrapped_vek_recov, iv_recov,
      session_secret, key_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meta.id,
      meta.salt,
      meta.server_salt,
      meta.auth_verifier_hash,
      meta.wrapped_vek_pass,
      meta.iv_pass,
      meta.kdf_iterations,
      meta.recov_verifier_hash,
      meta.wrapped_vek_recov,
      meta.iv_recov,
      meta.session_secret,
      meta.key_version,
      meta.created_at,
      meta.updated_at,
    ]
  );
}

export async function updateVaultPasswordWrapper(params: {
  salt: string;
  server_salt: string;
  auth_verifier_hash: string;
  wrapped_vek_pass: string;
  iv_pass: string;
  kdf_iterations: number;
  session_secret: string;
  updated_at: string;
}): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `UPDATE vault_meta
     SET salt = ?, server_salt = ?, auth_verifier_hash = ?,
         wrapped_vek_pass = ?, iv_pass = ?, kdf_iterations = ?,
         session_secret = ?, updated_at = ?
     WHERE id = ?`,
    [
      params.salt,
      params.server_salt,
      params.auth_verifier_hash,
      params.wrapped_vek_pass,
      params.iv_pass,
      params.kdf_iterations,
      params.session_secret,
      params.updated_at,
      "owner",
    ]
  );
}

export async function updateVaultRecoveryWrapper(params: {
  recov_verifier_hash: string;
  wrapped_vek_recov: string;
  iv_recov: string;
  updated_at: string;
}): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `UPDATE vault_meta
     SET recov_verifier_hash = ?, wrapped_vek_recov = ?, iv_recov = ?, updated_at = ?
     WHERE id = ?`,
    [
      params.recov_verifier_hash,
      params.wrapped_vek_recov,
      params.iv_recov,
      params.updated_at,
      "owner",
    ]
  );
}

export async function rotateVaultSessionSecret(newSecret: string): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    "UPDATE vault_meta SET session_secret = ?, updated_at = ? WHERE id = ?",
    [newSecret, new Date().toISOString(), "owner"]
  );
}

// -----------------------------------------------------------------------------
// Public Profile Operations
// -----------------------------------------------------------------------------
interface PublicProfileDbRow {
  id: string;
  public_token: string;
  lost_mode: number;
  lost_banner_title: string;
  owner_name: string;
  tagline: string;
  bio: string;
  location_label: string;
  avatar_url: string;
  masked_phone: string;
  public_email: string;
  blood_group: string;
  allergies: string;
  critical_medical_notes: string;
  emergency_instructions: string;
  custom_links_json: string;
  contacts_json: string;
  visibility_json: string;
  updated_at: string;
}

function mapDbRowToPublicProfile(row: PublicProfileDbRow): PublicEmergencyProfile {
  let customLinks: PublicCustomLink[] = [];
  let contacts: EmergencyContact[] = [];
  let vis: PublicVisibilitySettings = { ...DEFAULT_VISIBILITY_SETTINGS };

  try {
    customLinks = JSON.parse(row.custom_links_json || "[]");
  } catch {
    customLinks = [];
  }
  try {
    contacts = JSON.parse(row.contacts_json || "[]");
  } catch {
    contacts = [];
  }
  try {
    vis = { ...DEFAULT_VISIBILITY_SETTINGS, ...JSON.parse(row.visibility_json || "{}") };
  } catch {
    vis = { ...DEFAULT_VISIBILITY_SETTINGS };
  }

  return {
    public_token: row.public_token,
    is_lost_mode: Boolean(row.lost_mode),
    lost_banner_title: row.lost_banner_title,
    owner_name: row.owner_name,
    tagline: row.tagline,
    bio: row.bio,
    location_label: row.location_label,
    avatar_url: row.avatar_url,
    masked_owner_phone: row.masked_phone,
    public_email: row.public_email,
    blood_group: row.blood_group,
    allergies: row.allergies,
    critical_medical_notes: row.critical_medical_notes,
    emergency_instructions: row.emergency_instructions,
    custom_links: customLinks,
    emergency_contacts: contacts,
    ...vis,
  };
}

export async function getPublicProfileFull(): Promise<PublicEmergencyProfile> {
  await ensureDbInitialized();
  const rows = await rawQuery<PublicProfileDbRow>(
    "SELECT * FROM public_profile WHERE id = ?",
    ["owner"]
  );
  if (!rows[0]) return { ...DEFAULT_PUBLIC_PROFILE };
  return mapDbRowToPublicProfile(rows[0]);
}

export async function getPublicProfileByToken(
  token: string
): Promise<PublicEmergencyProfile | null> {
  const full = await getPublicProfileFull();
  if (
    token === "default" ||
    token === "default-scan" ||
    token === full.public_token
  ) {
    return full;
  }
  return null;
}

export async function savePublicProfile(profile: PublicEmergencyProfile): Promise<void> {
  await ensureDbInitialized();
  const visibility: PublicVisibilitySettings = {
    show_avatar: profile.show_avatar,
    show_owner_name: profile.show_owner_name,
    show_tagline: profile.show_tagline,
    show_location: profile.show_location,
    show_bio: profile.show_bio,
    show_owner_phone: profile.show_owner_phone,
    show_public_email: profile.show_public_email,
    show_custom_links: profile.show_custom_links,
    show_blood_group: profile.show_blood_group,
    show_allergies: profile.show_allergies,
    show_medical_notes: profile.show_medical_notes,
    show_emergency_contacts: profile.show_emergency_contacts,
    show_message_form: profile.show_message_form,
    show_qr_code: profile.show_qr_code,
  };

  await rawQuery(
    `UPDATE public_profile
     SET public_token = ?, lost_mode = ?, lost_banner_title = ?,
         owner_name = ?, tagline = ?, bio = ?, location_label = ?, avatar_url = ?,
         masked_phone = ?, public_email = ?, blood_group = ?, allergies = ?,
         critical_medical_notes = ?, emergency_instructions = ?,
         custom_links_json = ?, contacts_json = ?, visibility_json = ?, updated_at = ?
     WHERE id = ?`,
    [
      profile.public_token.trim() || "owner",
      profile.is_lost_mode ? 1 : 0,
      profile.lost_banner_title,
      profile.owner_name,
      profile.tagline,
      profile.bio,
      profile.location_label,
      profile.avatar_url,
      profile.masked_owner_phone,
      profile.public_email,
      profile.blood_group,
      profile.allergies,
      profile.critical_medical_notes,
      profile.emergency_instructions,
      JSON.stringify(profile.custom_links || []),
      JSON.stringify(profile.emergency_contacts || []),
      JSON.stringify(visibility),
      new Date().toISOString(),
      "owner",
    ]
  );
}

export async function setLostMode(enabled: boolean): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    "UPDATE public_profile SET lost_mode = ?, updated_at = ? WHERE id = ?",
    [enabled ? 1 : 0, new Date().toISOString(), "owner"]
  );
}

/**
 * Hardened public view filter:
 * - In Lost Mode: strips sensitive personal phone, email, links, medical info, and emergency contacts at the server layer!
 * - In Normal Mode: applies owner's granular visibility toggles.
 */
export function filterPublicScanResponse(profile: PublicEmergencyProfile) {
  if (profile.is_lost_mode) {
    return {
      public_token: profile.public_token,
      lost_mode: true,
      lost_banner_title: profile.lost_banner_title || "Keychain Reported Lost",
      owner_name: profile.show_owner_name ? profile.owner_name : "DataKey Owner",
      tagline: null,
      bio: null,
      location_label: null,
      avatar_url: null,
      masked_phone: null,
      public_email: null,
      custom_links: [],
      blood_group: null,
      allergies: null,
      critical_medical_notes: null,
      emergency_instructions:
        profile.emergency_instructions ||
        "THIS ITEM HAS BEEN MARKED AS LOST. Please submit your contact info or location below.",
      emergency_contacts: [],
      show_avatar: false,
      show_message_form: profile.show_message_form,
      show_qr_code: profile.show_qr_code,
    };
  }

  return {
    public_token: profile.public_token,
    lost_mode: false,
    lost_banner_title: profile.lost_banner_title,
    owner_name: profile.show_owner_name ? profile.owner_name : null,
    tagline: profile.show_tagline ? profile.tagline : null,
    bio: profile.show_bio ? profile.bio : null,
    location_label: profile.show_location ? profile.location_label : null,
    avatar_url: profile.show_avatar ? profile.avatar_url : null,
    masked_phone: profile.show_owner_phone ? profile.masked_owner_phone : null,
    public_email: profile.show_public_email ? profile.public_email : null,
    custom_links: profile.show_custom_links
      ? (profile.custom_links || []).filter((l) => l.is_visible && l.url.trim())
      : [],
    blood_group: profile.show_blood_group ? profile.blood_group : null,
    allergies: profile.show_allergies ? profile.allergies : null,
    critical_medical_notes: profile.show_medical_notes ? profile.critical_medical_notes : null,
    emergency_instructions: profile.emergency_instructions,
    emergency_contacts: profile.show_emergency_contacts
      ? (profile.emergency_contacts || [])
          .filter((c) => c.is_visible)
          .sort((a, b) => a.priority_order - b.priority_order)
          .map((c) => ({
            id: c.id,
            name: c.name,
            relationship: c.relationship,
            phone: c.phone_number,
            priority: c.priority_order,
          }))
      : [],
    show_avatar: profile.show_avatar,
    show_message_form: profile.show_message_form,
    show_qr_code: profile.show_qr_code,
  };
}

// -----------------------------------------------------------------------------
// Vault Encrypted Records CRUD
// -----------------------------------------------------------------------------
export async function listVaultRecords(): Promise<VaultRecordRow[]> {
  await ensureDbInitialized();
  return rawQuery<VaultRecordRow>(
    "SELECT * FROM vault_records ORDER BY updated_at DESC"
  );
}

export async function getVaultRecord(recordId: string): Promise<VaultRecordRow | null> {
  await ensureDbInitialized();
  const rows = await rawQuery<VaultRecordRow>(
    "SELECT * FROM vault_records WHERE record_id = ?",
    [recordId]
  );
  return rows[0] || null;
}

export async function insertVaultRecord(rec: VaultRecordRow): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `INSERT INTO vault_records (
      record_id, category, folder_id, ciphertext, salt, nonce, auth_tag,
      key_version, version, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      rec.record_id,
      rec.category,
      rec.folder_id,
      rec.ciphertext,
      rec.salt,
      rec.nonce,
      rec.auth_tag,
      rec.key_version,
      rec.version,
      rec.deleted_at,
      rec.created_at,
      rec.updated_at,
    ]
  );
}

export async function updateVaultRecordEncrypted(params: {
  record_id: string;
  ciphertext: string;
  salt: string;
  nonce: string;
  auth_tag: string;
  folder_id: string | null;
  expected_version: number;
  new_version: number;
  updated_at: string;
}): Promise<boolean> {
  await ensureDbInitialized();
  const existing = await getVaultRecord(params.record_id);
  if (!existing || existing.version !== params.expected_version) {
    return false;
  }
  await rawQuery(
    `UPDATE vault_records
     SET ciphertext = ?, salt = ?, nonce = ?, auth_tag = ?,
         folder_id = ?, version = ?, updated_at = ?
     WHERE record_id = ? AND version = ?`,
    [
      params.ciphertext,
      params.salt,
      params.nonce,
      params.auth_tag,
      params.folder_id,
      params.new_version,
      params.updated_at,
      params.record_id,
      params.expected_version,
    ]
  );
  return true;
}

export async function setVaultRecordDeletedAt(
  recordId: string,
  deletedAt: string | null
): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    "UPDATE vault_records SET deleted_at = ?, updated_at = ? WHERE record_id = ?",
    [deletedAt, new Date().toISOString(), recordId]
  );
}

export async function shredVaultRecord(recordId: string): Promise<void> {
  await ensureDbInitialized();
  await rawQuery("DELETE FROM vault_file_chunks WHERE file_id = ?", [recordId]);
  await rawQuery("DELETE FROM vault_records WHERE record_id = ?", [recordId]);
}

// -----------------------------------------------------------------------------
// Encrypted File Chunks (Stored directly inside Free DB — zero R2 required!)
// -----------------------------------------------------------------------------
export async function saveEncryptedFileChunk(
  fileId: string,
  chunkIndex: number,
  dataBase64: string
): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `INSERT INTO vault_file_chunks (file_id, chunk_index, data_base64, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (file_id, chunk_index)
     DO UPDATE SET data_base64 = excluded.data_base64, created_at = excluded.created_at`,
    [fileId, chunkIndex, dataBase64, new Date().toISOString()]
  );
}

export async function getEncryptedFileChunk(
  fileId: string,
  chunkIndex: number
): Promise<string | null> {
  await ensureDbInitialized();
  const rows = await rawQuery<{ data_base64: string }>(
    "SELECT data_base64 FROM vault_file_chunks WHERE file_id = ? AND chunk_index = ?",
    [fileId, chunkIndex]
  );
  return rows[0]?.data_base64 ?? null;
}

export async function deleteEncryptedFileChunks(fileId: string): Promise<void> {
  await ensureDbInitialized();
  await rawQuery("DELETE FROM vault_file_chunks WHERE file_id = ?", [fileId]);
}

// -----------------------------------------------------------------------------
// Finder Transmissions & Retention Purge
// -----------------------------------------------------------------------------
export async function listFinderTransmissions(): Promise<FinderTransmissionRow[]> {
  await ensureDbInitialized();
  return rawQuery<FinderTransmissionRow>(
    "SELECT * FROM finder_transmissions ORDER BY created_at DESC"
  );
}

export async function insertFinderTransmission(
  tx: FinderTransmissionRow
): Promise<void> {
  await ensureDbInitialized();
  await rawQuery(
    `INSERT INTO finder_transmissions (
      id, public_token, message, finder_contact,
      latitude, longitude, accuracy_meters, location_denied, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id,
      tx.public_token,
      tx.message,
      tx.finder_contact,
      tx.latitude,
      tx.longitude,
      tx.accuracy_meters,
      tx.location_denied,
      tx.created_at,
    ]
  );
}

export async function deleteFinderTransmission(id: string): Promise<void> {
  await ensureDbInitialized();
  await rawQuery("DELETE FROM finder_transmissions WHERE id = ?", [id]);
}

export async function purgeExpiredRecords(retentionDays: number): Promise<{
  recordsPurged: number;
  transmissionsPurged: number;
}> {
  await ensureDbInitialized();
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();

  const expiredRecords = await rawQuery<{ record_id: string }>(
    "SELECT record_id FROM vault_records WHERE deleted_at IS NOT NULL AND deleted_at < ?",
    [cutoff]
  );
  for (const r of expiredRecords) {
    await shredVaultRecord(r.record_id);
  }

  const expiredTx = await rawQuery<{ id: string }>(
    "SELECT id FROM finder_transmissions WHERE created_at < ?",
    [cutoff]
  );
  await rawQuery("DELETE FROM finder_transmissions WHERE created_at < ?", [cutoff]);

  return {
    recordsPurged: expiredRecords.length,
    transmissionsPurged: expiredTx.length,
  };
}

