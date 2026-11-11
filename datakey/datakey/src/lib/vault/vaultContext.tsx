"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  deriveSubkeysFromVek,
  encryptRecord,
  decryptRecord,
  encryptFile,
  decryptFile,
  zeroBuffer,
  zeroBuffers,
  toBase64,
  fromBase64,
  SIMPLE_OWNER_ID,
  deriveSimplePasswordKeys,
  rewrapSimpleVekWithNewPassword,
  regenerateSimpleRecoveryKey,
  type UnwrappedVaultKeys,
  type EncryptedRecordPayload,
  type AuthenticatedFileManifest,
  type FileChunkEncrypted,
} from "@/lib/crypto";
import {
  DEFAULT_PUBLIC_PROFILE,
  DEFAULT_FOLDERS,
  type PublicEmergencyProfile,
  type VaultCredential,
  type VaultNote,
  type VaultFileMeta,
  type FinderTransmission,
  type VaultFolder,
} from "./vaultState";
import { datakeyConfig } from "@config/datakey.config";

interface VaultContextType {
  isVaultUnlocked: boolean;
  isLoadingVault: boolean;
  autoLockCountdown: number;
  dbDriver: string;

  unlockWithVek: (vek: Uint8Array) => void;
  lockVault: (signOutServer?: boolean) => Promise<void>;
  refreshVaultData: () => Promise<void>;

  publicProfile: PublicEmergencyProfile;
  credentials: VaultCredential[];
  notes: VaultNote[];
  files: VaultFileMeta[];
  finderTransmissions: FinderTransmission[];
  folders: VaultFolder[];

  toggleLostMode: (enabled: boolean) => Promise<void>;
  updatePublicProfile: (profile: PublicEmergencyProfile) => Promise<void>;

  addCredential: (
    cred: Omit<VaultCredential, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => Promise<void>;
  updateCredential: (id: string, cred: Partial<VaultCredential>) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  restoreCredential: (id: string) => Promise<void>;
  shredCredential: (id: string) => Promise<void>;

  addNote: (
    note: Omit<VaultNote, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => Promise<void>;
  updateNote: (id: string, note: Partial<VaultNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  shredNote: (id: string) => Promise<void>;

  uploadFile: (file: File, folderId?: string, onProgress?: (p: number) => void) => Promise<void>;
  downloadFile: (
    fileId: string
  ) => Promise<{ data: Uint8Array; fileName: string; mimeType: string }>;
  deleteFile: (fileId: string) => Promise<void>;
  restoreFile: (fileId: string) => Promise<void>;
  shredFile: (fileId: string) => Promise<void>;

  refreshTransmissions: () => Promise<void>;
  deleteTransmission: (id: string) => Promise<void>;

  changeMasterPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  regenerateRecoveryKey: () => Promise<string>;
  exportVaultBackupPayload: () => Promise<{ manifest: string; parts: string[] }>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const vekRef = useRef<Uint8Array | null>(null);
  const subkeysRef = useRef<UnwrappedVaultKeys | null>(null);

  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [isLoadingVault, setIsLoadingVault] = useState(false);
  const [dbDriver, setDbDriver] = useState("sqlite");

  const defaultAutoLockSeconds = datakeyConfig.security.sessions.autoLockMinutes * 60;
  const [autoLockCountdown, setAutoLockCountdown] = useState(defaultAutoLockSeconds);
  const hiddenTimestampRef = useRef<number | null>(null);

  const [publicProfile, setPublicProfile] = useState<PublicEmergencyProfile>(
    DEFAULT_PUBLIC_PROFILE
  );
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [files, setFiles] = useState<VaultFileMeta[]>([]);
  const [finderTransmissions, setFinderTransmissions] = useState<FinderTransmission[]>([]);
  const [folders] = useState<VaultFolder[]>(DEFAULT_FOLDERS);

  const lockVault = useCallback(
    async (signOutServer = true) => {
      if (vekRef.current) {
        zeroBuffer(vekRef.current);
        vekRef.current = null;
      }
      if (subkeysRef.current) {
        zeroBuffers(
          subkeysRef.current.vek,
          subkeysRef.current.k_record,
          subkeysRef.current.k_file_master,
          subkeysRef.current.k_export,
          subkeysRef.current.k_manifest
        );
        subkeysRef.current = null;
      }

      setCredentials([]);
      setNotes([]);
      setFiles([]);
      setFinderTransmissions([]);
      setIsVaultUnlocked(false);
      setAutoLockCountdown(defaultAutoLockSeconds);

      if (signOutServer) {
        try {
          await fetch("/api/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revokeAll: false }),
          });
        } catch {
          // Best-effort cookie clear
        }
      }
    },
    [defaultAutoLockSeconds]
  );

  // Inactivity & tab-hidden auto-lock
  useEffect(() => {
    if (!isVaultUnlocked) return;

    const timer = setInterval(() => {
      setAutoLockCountdown((prev) => {
        if (prev <= 1) {
          void lockVault(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const resetInactivity = () => {
      setAutoLockCountdown(defaultAutoLockSeconds);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenTimestampRef.current = Date.now();
      } else if (document.visibilityState === "visible" && hiddenTimestampRef.current) {
        const elapsedSeconds = (Date.now() - hiddenTimestampRef.current) / 1000;
        if (elapsedSeconds >= datakeyConfig.security.sessions.tabHiddenLockSeconds) {
          void lockVault(true);
        }
        hiddenTimestampRef.current = null;
      }
    };

    window.addEventListener("mousemove", resetInactivity);
    window.addEventListener("keydown", resetInactivity);
    window.addEventListener("click", resetInactivity);
    window.addEventListener("touchstart", resetInactivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener("mousemove", resetInactivity);
      window.removeEventListener("keydown", resetInactivity);
      window.removeEventListener("click", resetInactivity);
      window.removeEventListener("touchstart", resetInactivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isVaultUnlocked, lockVault, defaultAutoLockSeconds]);

  const refreshVaultData = useCallback(async () => {
    if (!subkeysRef.current) return;
    const kRecord = subkeysRef.current.k_record;
    setIsLoadingVault(true);

    try {
      const [statusRes, profileRes, recordsRes, transRes] = await Promise.all([
        fetch("/api/auth/status"),
        fetch("/api/public/manage"),
        fetch("/api/vault/records"),
        fetch("/api/vault/transmissions"),
      ]);

      if (statusRes.ok) {
        const st = await statusRes.json();
        if (st.dbDriver) setDbDriver(st.dbDriver);
      }

      if (profileRes.ok) {
        const profileData = (await profileRes.json()) as PublicEmergencyProfile;
        setPublicProfile(profileData);
      }

      if (recordsRes.ok) {
        const { records } = (await recordsRes.json()) as {
          records: Array<{
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
          }>;
        };

        const loadedCreds: VaultCredential[] = [];
        const loadedNotes: VaultNote[] = [];
        const loadedFiles: VaultFileMeta[] = [];

        for (const rec of records || []) {
          const payload: EncryptedRecordPayload = {
            salt: rec.salt,
            nonce: rec.nonce,
            ciphertext: rec.ciphertext,
            auth_tag: rec.auth_tag,
            key_version: rec.key_version,
            category: rec.category,
            record_id: rec.record_id,
          };

          try {
            const decrypted = await decryptRecord<Record<string, unknown>>(
              kRecord,
              SIMPLE_OWNER_ID,
              payload
            );

            if (rec.category === "login") {
              loadedCreds.push({
                id: rec.record_id,
                title: (decrypted.title as string) || "Untitled",
                category: (decrypted.category as VaultCredential["category"]) || "Other",
                username: (decrypted.username as string) || "",
                password: (decrypted.password as string) || "",
                url: decrypted.url as string | undefined,
                notes: decrypted.notes as string | undefined,
                folder_id: rec.folder_id || undefined,
                version_counter: rec.version,
                is_deleted: !!rec.deleted_at,
                deleted_at: rec.deleted_at || undefined,
                updated_at: rec.updated_at,
              });
            } else if (rec.category === "note") {
              loadedNotes.push({
                id: rec.record_id,
                title: (decrypted.title as string) || "Untitled Note",
                content: (decrypted.content as string) || "",
                tags: (decrypted.tags as string[]) || [],
                folder_id: rec.folder_id || undefined,
                is_pinned: (decrypted.is_pinned as boolean) || false,
                version_counter: rec.version,
                is_deleted: !!rec.deleted_at,
                deleted_at: rec.deleted_at || undefined,
                updated_at: rec.updated_at,
              });
            } else if (rec.category === "file_manifest") {
              const manifest = decrypted as unknown as AuthenticatedFileManifest;
              loadedFiles.push({
                id: rec.record_id,
                file_name: manifest.original_file_name,
                mime_type: manifest.mime_type,
                file_size: manifest.plaintext_size,
                folder_id: rec.folder_id || undefined,
                total_chunks: manifest.total_chunks,
                is_deleted: !!rec.deleted_at,
                deleted_at: rec.deleted_at || undefined,
                created_at: manifest.created_at || rec.created_at,
              });
            }
          } catch (decryptErr) {
            console.error(`Failed to decrypt record ${rec.record_id}:`, decryptErr);
          }
        }

        setCredentials(loadedCreds);
        setNotes(loadedNotes);
        setFiles(loadedFiles);
      }

      if (transRes.ok) {
        const { transmissions } = await transRes.json();
        setFinderTransmissions(transmissions || []);
      }
    } catch (err) {
      console.error("Failed loading vault data:", err);
    } finally {
      setIsLoadingVault(false);
    }
  }, []);

  const unlockWithVek = useCallback(
    (vek: Uint8Array) => {
      vekRef.current = new Uint8Array(vek);
      subkeysRef.current = deriveSubkeysFromVek(vekRef.current);
      setIsVaultUnlocked(true);
      setAutoLockCountdown(defaultAutoLockSeconds);
      void refreshVaultData();
    },
    [defaultAutoLockSeconds, refreshVaultData]
  );

  // ---------------------------------------------------------------------------
  // Public View & Lost Mode Mutators
  // ---------------------------------------------------------------------------
  const toggleLostMode = async (enabled: boolean) => {
    const res = await fetch("/api/public/manage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lostModeOnly: true, enabled }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update Lost Mode");
    }
    setPublicProfile((prev) => ({ ...prev, is_lost_mode: enabled }));
  };

  const updatePublicProfile = async (updated: PublicEmergencyProfile) => {
    const res = await fetch("/api/public/manage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save Public View settings");
    }
    setPublicProfile(updated);
  };

  // ---------------------------------------------------------------------------
  // Credentials CRUD
  // ---------------------------------------------------------------------------
  const addCredential = async (
    cred: Omit<VaultCredential, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => {
    if (!subkeysRef.current) throw new Error("Vault locked");
    const recordId = crypto.randomUUID();
    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      recordId,
      "login",
      cred
    );

    const res = await fetch("/api/vault/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_id: recordId,
        category: "login",
        folder_id: cred.folder_id || null,
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        key_version: payload.key_version,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save credential");
    }

    setCredentials((prev) => [
      {
        ...cred,
        id: recordId,
        version_counter: 1,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const updateCredential = async (id: string, updates: Partial<VaultCredential>) => {
    if (!subkeysRef.current) throw new Error("Vault locked");
    const existing = credentials.find((c) => c.id === id);
    if (!existing) throw new Error("Credential not found");

    const merged = { ...existing, ...updates };
    const newVersion = existing.version_counter + 1;

    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      id,
      "login",
      {
        title: merged.title,
        category: merged.category,
        username: merged.username,
        password: merged.password,
        url: merged.url,
        notes: merged.notes,
        folder_id: merged.folder_id,
      }
    );

    const res = await fetch("/api/vault/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_id: id,
        folder_id: merged.folder_id || null,
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        expected_version: existing.version_counter,
        new_version: newVersion,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update credential");
    }

    setCredentials((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...merged, version_counter: newVersion, updated_at: new Date().toISOString() }
          : c
      )
    );
  };

  const setRecordTrashState = async (recordId: string, deletedAt: string | null) => {
    const res = await fetch("/api/vault/records", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record_id: recordId, deleted_at: deletedAt }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update recycle bin");
    }
  };

  const deleteCredential = async (id: string) => {
    const now = new Date().toISOString();
    await setRecordTrashState(id, now);
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: true, deleted_at: now } : c))
    );
  };

  const restoreCredential = async (id: string) => {
    await setRecordTrashState(id, null);
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: false, deleted_at: undefined } : c))
    );
  };

  const shredCredential = async (id: string) => {
    const res = await fetch(`/api/vault/records?record_id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to shred credential");
    setCredentials((prev) => prev.filter((c) => c.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Notes CRUD
  // ---------------------------------------------------------------------------
  const addNote = async (
    note: Omit<VaultNote, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => {
    if (!subkeysRef.current) throw new Error("Vault locked");
    const recordId = crypto.randomUUID();
    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      recordId,
      "note",
      note
    );

    const res = await fetch("/api/vault/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_id: recordId,
        category: "note",
        folder_id: note.folder_id || null,
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        key_version: payload.key_version,
      }),
    });

    if (!res.ok) throw new Error("Failed to save note");

    setNotes((prev) => [
      {
        ...note,
        id: recordId,
        version_counter: 1,
        is_deleted: false,
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const updateNote = async (id: string, updates: Partial<VaultNote>) => {
    if (!subkeysRef.current) throw new Error("Vault locked");
    const existing = notes.find((n) => n.id === id);
    if (!existing) throw new Error("Note not found");

    const merged = { ...existing, ...updates };
    const newVersion = existing.version_counter + 1;

    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      id,
      "note",
      {
        title: merged.title,
        content: merged.content,
        tags: merged.tags,
        folder_id: merged.folder_id,
        is_pinned: merged.is_pinned,
      }
    );

    const res = await fetch("/api/vault/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_id: id,
        folder_id: merged.folder_id || null,
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        expected_version: existing.version_counter,
        new_version: newVersion,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update note");
    }

    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...merged, version_counter: newVersion, updated_at: new Date().toISOString() }
          : n
      )
    );
  };

  const deleteNote = async (id: string) => {
    const now = new Date().toISOString();
    await setRecordTrashState(id, now);
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_deleted: true, deleted_at: now } : n))
    );
  };

  const restoreNote = async (id: string) => {
    await setRecordTrashState(id, null);
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_deleted: false, deleted_at: undefined } : n))
    );
  };

  const shredNote = async (id: string) => {
    const res = await fetch(`/api/vault/records?record_id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to shred note");
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Encrypted Files (Chunked AES-GCM stored directly in Free DB)
  // ---------------------------------------------------------------------------
  const uploadFile = async (
    file: File,
    folderId?: string,
    onProgress?: (percent: number) => void
  ) => {
    if (!subkeysRef.current) throw new Error("Vault locked");

    if (file.size > datakeyConfig.security.storage.maxFileSizeBytes) {
      throw new Error(
        `File size exceeds maximum allowed (${datakeyConfig.security.storage.maxFileSizeBytes / (1024 * 1024)} MiB)`
      );
    }

    const fileId = crypto.randomUUID();
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const { manifest, chunks } = await encryptFile(
      subkeysRef.current.k_file_master,
      SIMPLE_OWNER_ID,
      fileId,
      file.name,
      file.type || "application/octet-stream",
      fileBytes,
      datakeyConfig.security.storage.chunkSizeBytes
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          chunkIndex: i,
          dataBase64: toBase64(chunk.ciphertext_with_tag),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to upload encrypted chunk ${i}`);
      }

      onProgress?.(Math.round(((i + 1) / chunks.length) * 100));
    }

    const encryptedManifestRecord = await encryptRecord(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      fileId,
      "file_manifest",
      manifest as unknown as Record<string, unknown>
    );

    const dbRes = await fetch("/api/vault/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        record_id: fileId,
        category: "file_manifest",
        folder_id: folderId || null,
        ciphertext: encryptedManifestRecord.ciphertext,
        salt: encryptedManifestRecord.salt,
        nonce: encryptedManifestRecord.nonce,
        auth_tag: encryptedManifestRecord.auth_tag,
        key_version: encryptedManifestRecord.key_version,
      }),
    });

    if (!dbRes.ok) {
      throw new Error("Failed to register encrypted file manifest");
    }

    setFiles((prev) => [
      {
        id: fileId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        folder_id: folderId,
        total_chunks: chunks.length,
        is_deleted: false,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const downloadFile = async (
    fileId: string
  ): Promise<{ data: Uint8Array; fileName: string; mimeType: string }> => {
    if (!subkeysRef.current) throw new Error("Vault locked");

    const recordsRes = await fetch("/api/vault/records");
    if (!recordsRes.ok) throw new Error("Unable to fetch file manifests");
    const { records } = (await recordsRes.json()) as {
      records: Array<{
        record_id: string;
        category: string;
        ciphertext: string;
        salt: string;
        nonce: string;
        auth_tag: string;
        key_version: number;
      }>;
    };

    const record = records.find((r) => r.record_id === fileId);
    if (!record) throw new Error("File manifest not found");

    const manifest = await decryptRecord<AuthenticatedFileManifest>(
      subkeysRef.current.k_record,
      SIMPLE_OWNER_ID,
      {
        salt: record.salt,
        nonce: record.nonce,
        ciphertext: record.ciphertext,
        auth_tag: record.auth_tag,
        key_version: record.key_version,
        category: record.category,
        record_id: record.record_id,
      }
    );

    const chunks: FileChunkEncrypted[] = [];
    for (let i = 0; i < manifest.total_chunks; i++) {
      const chunkRes = await fetch(
        `/api/files/download?fileId=${encodeURIComponent(fileId)}&chunkIndex=${i}`
      );
      if (!chunkRes.ok) throw new Error(`Failed to download chunk ${i}`);
      const { dataBase64 } = (await chunkRes.json()) as { dataBase64: string };
      const chunkBuffer = fromBase64(dataBase64);

      chunks.push({
        chunk_index: i,
        total_chunks: manifest.total_chunks,
        is_last_chunk: i === manifest.total_chunks - 1,
        ciphertext_with_tag: chunkBuffer,
        chunk_hash_sha256: manifest.chunk_hashes[i],
      });
    }

    const plaintextBytes = await decryptFile(
      subkeysRef.current.k_file_master,
      SIMPLE_OWNER_ID,
      manifest,
      chunks
    );

    return {
      data: plaintextBytes,
      fileName: manifest.original_file_name,
      mimeType: manifest.mime_type,
    };
  };

  const deleteFile = async (fileId: string) => {
    const now = new Date().toISOString();
    await setRecordTrashState(fileId, now);
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, is_deleted: true, deleted_at: now } : f))
    );
  };

  const restoreFile = async (fileId: string) => {
    await setRecordTrashState(fileId, null);
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, is_deleted: false, deleted_at: undefined } : f))
    );
  };

  const shredFile = async (fileId: string) => {
    const res = await fetch(`/api/vault/records?record_id=${encodeURIComponent(fileId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to shred file");
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // ---------------------------------------------------------------------------
  // Transmissions
  // ---------------------------------------------------------------------------
  const refreshTransmissions = async () => {
    const res = await fetch("/api/vault/transmissions");
    if (res.ok) {
      const { transmissions } = await res.json();
      setFinderTransmissions(transmissions || []);
    }
  };

  const deleteTransmission = async (id: string) => {
    const res = await fetch(`/api/vault/transmissions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete transmission");
    setFinderTransmissions((prev) => prev.filter((t) => t.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Password Change & Recovery Key Management
  // ---------------------------------------------------------------------------
  const changeMasterPassword = async (currentPassword: string, newPassword: string) => {
    if (!vekRef.current) throw new Error("Vault locked");
    if (newPassword.length < datakeyConfig.security.passwords.minMasterPasswordLength) {
      throw new Error(
        `New Master Password must be at least ${datakeyConfig.security.passwords.minMasterPasswordLength} characters.`
      );
    }

    const statusRes = await fetch("/api/auth/status");
    const status = await statusRes.json();
    if (!status.salt) throw new Error("Vault status unavailable");

    const { authToken: currentAuthToken } = await deriveSimplePasswordKeys(
      currentPassword,
      status.salt,
      status.kdfIterations
    );

    const rewrapped = await rewrapSimpleVekWithNewPassword(
      newPassword,
      vekRef.current,
      status.keyVersion || 1
    );

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentAuthToken,
        newSalt: rewrapped.salt,
        newAuthToken: rewrapped.authToken,
        newWrappedVekPass: rewrapped.wrappedVekPass,
        newIvPass: rewrapped.ivPass,
        newKdfIterations: rewrapped.kdfIterations,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update Master Password");
    }
  };

  const regenerateRecoveryKey = async (): Promise<string> => {
    if (!vekRef.current) throw new Error("Vault locked");

    const regenerated = await regenerateSimpleRecoveryKey(vekRef.current, 1);
    const res = await fetch("/api/auth/rotate-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recovAuthToken: regenerated.recovAuthToken,
        wrappedVekRecov: regenerated.wrappedVekRecov,
        ivRecov: regenerated.ivRecov,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update Recovery Key");
    }

    return regenerated.recoveryKey;
  };

  // ---------------------------------------------------------------------------
  // Offline Multi-Part Backup Exporter
  // ---------------------------------------------------------------------------
  const exportVaultBackupPayload = async (): Promise<{ manifest: string; parts: string[] }> => {
    if (!subkeysRef.current) throw new Error("Vault locked");

    const res = await fetch("/api/vault/backup-bundle");
    if (!res.ok) throw new Error("Failed to fetch vault records for backup");
    const { envelope, records } = await res.json();

    const backupDate = new Date().toISOString();
    const payloadString = JSON.stringify({
      schema_version: "3.0-simple",
      created_at: backupDate,
      user_id: SIMPLE_OWNER_ID,
      envelope,
      records: records || [],
    });

    const partSize = datakeyConfig.security.storage.backupPartSizeBytes;
    const bytes = new TextEncoder().encode(payloadString);
    const totalParts = Math.ceil(bytes.length / partSize) || 1;

    const parts: string[] = [];
    const partHashes: string[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partSlice = bytes.slice(i * partSize, (i + 1) * partSize);
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        partSlice as unknown as BufferSource
      );
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      partHashes.push(hashHex);

      parts.push(
        JSON.stringify({
          part_index: i + 1,
          total_parts: totalParts,
          data_base64: toBase64(partSlice),
          part_sha256: hashHex,
        })
      );
    }

    const manifestObj = {
      backup_date: backupDate,
      version: "3.0-simple",
      total_parts: totalParts,
      part_hashes: partHashes,
      user_id: SIMPLE_OWNER_ID,
    };

    const encryptedManifest = await encryptRecord(
      subkeysRef.current.k_manifest,
      SIMPLE_OWNER_ID,
      "backup_manifest",
      "system",
      manifestObj
    );

    return {
      manifest: JSON.stringify({
        ...encryptedManifest,
        version: "3.0-simple",
        total_parts: totalParts,
        part_hashes: partHashes,
      }),
      parts,
    };
  };

  return (
    <VaultContext.Provider
      value={{
        isVaultUnlocked,
        isLoadingVault,
        autoLockCountdown,
        dbDriver,
        unlockWithVek,
        lockVault,
        refreshVaultData,
        publicProfile,
        credentials,
        notes,
        files,
        finderTransmissions,
        folders,
        toggleLostMode,
        updatePublicProfile,
        addCredential,
        updateCredential,
        deleteCredential,
        restoreCredential,
        shredCredential,
        addNote,
        updateNote,
        deleteNote,
        restoreNote,
        shredNote,
        uploadFile,
        downloadFile,
        deleteFile,
        restoreFile,
        shredFile,
        refreshTransmissions,
        deleteTransmission,
        changeMasterPassword,
        regenerateRecoveryKey,
        exportVaultBackupPayload,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return context;
}
