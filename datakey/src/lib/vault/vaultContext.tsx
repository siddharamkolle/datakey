"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deriveSubkeysFromVek,
  encryptRecord,
  decryptRecord,
  encryptFile,
  decryptFile,
  zeroBuffer,
  zeroBuffers,
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
  type ActiveSession,
  type VaultFolder,
  type EmergencyContact,
} from "./vaultState";
import { datakeyConfig } from "@config/datakey.config";

interface VaultContextType {
  // Session & Auth
  userId: string | null;
  userEmail: string | null;
  aalLevel: string | null;
  isVaultUnlocked: boolean;
  autoLockCountdown: number;

  // Vault Unlocking & Memory Lifecycle
  unlockWithVek: (vek: Uint8Array) => void;
  lockVault: () => void;

  // Data Collections
  publicProfile: PublicEmergencyProfile;
  credentials: VaultCredential[];
  notes: VaultNote[];
  files: VaultFileMeta[];
  finderTransmissions: FinderTransmission[];
  sessions: ActiveSession[];
  folders: VaultFolder[];

  // Mutators
  toggleLostMode: (enabled: boolean) => Promise<void>;
  updatePublicProfile: (profile: PublicEmergencyProfile) => Promise<void>;
  
  // Credentials
  addCredential: (cred: Omit<VaultCredential, "id" | "version_counter" | "is_deleted" | "updated_at">) => Promise<void>;
  updateCredential: (id: string, cred: Partial<VaultCredential>) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  restoreCredential: (id: string) => Promise<void>;
  shredCredential: (id: string) => Promise<void>;

  // Notes
  addNote: (note: Omit<VaultNote, "id" | "version_counter" | "is_deleted" | "updated_at">) => Promise<void>;
  updateNote: (id: string, note: Partial<VaultNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  shredNote: (id: string) => Promise<void>;

  // Files
  uploadFile: (file: File, folderId?: string, onProgress?: (p: number) => void) => Promise<void>;
  downloadFile: (fileId: string) => Promise<{ data: Uint8Array; fileName: string; mimeType: string }>;
  deleteFile: (fileId: string) => Promise<void>;
  restoreFile: (fileId: string) => Promise<void>;
  shredFile: (fileId: string) => Promise<void>;

  // Transmissions & Sessions
  refreshTransmissions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;

  // Backup Export
  exportVaultBackupPayload: () => Promise<{ manifest: string; parts: string[] }>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  // Authentication & Session
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [aalLevel, setAalLevel] = useState<string | null>(null);

  // Volatile Decryption Keys (Zeroed on lock)
  const vekRef = useRef<Uint8Array | null>(null);
  const subkeysRef = useRef<UnwrappedVaultKeys | null>(null);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);

  // Inactivity & Auto-lock countdown (seconds)
  const defaultAutoLockSeconds = datakeyConfig.security.sessions.autoLockMinutes * 60;
  const [autoLockCountdown, setAutoLockCountdown] = useState(defaultAutoLockSeconds);
  const hiddenTimestampRef = useRef<number | null>(null);

  // Vault In-Memory Collections
  const [publicProfile, setPublicProfile] = useState<PublicEmergencyProfile>(DEFAULT_PUBLIC_PROFILE);
  const [credentials, setCredentials] = useState<VaultCredential[]>([]);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [files, setFiles] = useState<VaultFileMeta[]>([]);
  const [finderTransmissions, setFinderTransmissions] = useState<FinderTransmission[]>([]);
  const [sessions] = useState<ActiveSession[]>([]);
  const [folders] = useState<VaultFolder[]>(DEFAULT_FOLDERS);

  // ---------------------------------------------------------------------------
  // Memory Hygiene & Vault Locking
  // ---------------------------------------------------------------------------
  const lockVault = useCallback(() => {
    // Zero out all volatile key material immediately
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

    // Clear decrypted records from volatile memory
    setCredentials([]);
    setNotes([]);
    setFiles([]);
    setIsVaultUnlocked(false);
    setAutoLockCountdown(defaultAutoLockSeconds);
  }, [defaultAutoLockSeconds]);

  // ---------------------------------------------------------------------------
  // Supabase Auth & Session Monitoring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email || null);
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setAalLevel(aal?.currentLevel || "aal1");
      } else {
        setUserId(null);
        setUserEmail(null);
        setAalLevel(null);
        lockVault();
      }
    }

    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setAalLevel(aal?.currentLevel || "aal1");
      } else {
        setUserId(null);
        setUserEmail(null);
        setAalLevel(null);
        lockVault();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, lockVault]);

  // ---------------------------------------------------------------------------
  // Inactivity Auto-Lock & Tab Hidden Lock
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isVaultUnlocked) return;

    const timer = setInterval(() => {
      setAutoLockCountdown((prev) => {
        if (prev <= 1) {
          lockVault();
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
          lockVault();
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

  // ---------------------------------------------------------------------------
  // Load Decrypted Records when Vault is Unlocked
  // ---------------------------------------------------------------------------
  const loadDecryptedVault = useCallback(async () => {
    if (!isVaultUnlocked || !subkeysRef.current || !userId) return;

    const kRecord = subkeysRef.current.k_record;

    try {
      // 1. Fetch public profile
      const { data: profileData } = await supabase
        .from("public_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileData) {
        const { data: contactsData } = await supabase
          .from("public_emergency_contacts")
          .select("*")
          .eq("user_id", userId)
          .order("priority", { ascending: true });

        const mappedContacts: EmergencyContact[] = (contactsData || []).map((c) => ({
          id: c.id,
          name: c.name,
          relationship: c.relationship || "",
          phone_number: c.phone,
          priority_order: c.priority,
          is_visible: c.is_public,
        }));

        setPublicProfile({
          public_token: profileData.public_token,
          owner_name: profileData.owner_name,
          is_lost_mode: profileData.lost_mode,
          emergency_instructions: profileData.emergency_instructions,
          show_owner_name: profileData.visibility_settings?.owner_name ?? true,
          show_photo: false,
          show_owner_phone: profileData.visibility_settings?.masked_phone ?? true,
          masked_owner_phone: profileData.masked_phone || "",
          show_blood_group: profileData.visibility_settings?.blood_group ?? false,
          blood_group: profileData.blood_group || "",
          show_allergies: profileData.visibility_settings?.allergies ?? false,
          allergies: profileData.allergies || "",
          show_medical_notes: profileData.visibility_settings?.medical_notes ?? false,
          critical_medical_notes: profileData.critical_medical_notes || "",
          emergency_contacts: mappedContacts,
        });
      }

      // 2. Fetch encrypted records (logins, notes, file manifests)
      const { data: recordsData, error: recordsError } = await supabase
        .from("vault_records")
        .select("*")
        .eq("user_id", userId);

      if (recordsError) {
        console.error("Failed to load vault records:", recordsError);
        return;
      }

      const loadedCreds: VaultCredential[] = [];
      const loadedNotes: VaultNote[] = [];
      const loadedFiles: VaultFileMeta[] = [];

      for (const rec of recordsData || []) {
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
          const decrypted = await decryptRecord<Record<string, unknown>>(kRecord, userId, payload);

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

      // 3. Fetch finder transmissions
      const { data: transData } = await supabase
        .from("finder_transmissions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (transData) {
        setFinderTransmissions(
          transData.map((t) => ({
            id: t.id,
            finder_message: t.message,
            finder_contact_info: t.finder_contact || undefined,
            latitude: t.latitude,
            longitude: t.longitude,
            accuracy_meters: t.accuracy_meters || undefined,
            location_denied: t.location_denied,
            created_at: t.created_at,
          }))
        );
      }
    } catch (err) {
      console.error("Error loading decrypted vault:", err);
    }
  }, [isVaultUnlocked, userId, supabase]);

  const unlockWithVek = useCallback(async (vek: Uint8Array) => {
    // Retain VEK and derive domain-separated subkeys
    vekRef.current = new Uint8Array(vek);
    subkeysRef.current = deriveSubkeysFromVek(vekRef.current);
    setIsVaultUnlocked(true);
    setAutoLockCountdown(defaultAutoLockSeconds);
    // Explicitly load vault on unlock action
    void loadDecryptedVault();
  }, [defaultAutoLockSeconds, loadDecryptedVault]);

  // ---------------------------------------------------------------------------
  // Lost Mode & Public Profile Mutators
  // ---------------------------------------------------------------------------
  const toggleLostMode = async (enabled: boolean) => {
    if (!userId) return;
    const { error } = await supabase
      .from("public_profiles")
      .update({ lost_mode: enabled, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Failed to update Lost Mode: ${error.message}`);
    }

    setPublicProfile((prev) => ({ ...prev, is_lost_mode: enabled }));
  };

  const updatePublicProfile = async (updated: PublicEmergencyProfile) => {
    if (!userId) return;

    const visibilitySettings = {
      owner_name: updated.show_owner_name,
      masked_phone: updated.show_owner_phone,
      blood_group: updated.show_blood_group,
      allergies: updated.show_allergies,
      medical_notes: updated.show_medical_notes,
    };

    const { error: profileError } = await supabase
      .from("public_profiles")
      .update({
        owner_name: updated.owner_name,
        masked_phone: updated.masked_owner_phone,
        blood_group: updated.blood_group,
        allergies: updated.allergies,
        critical_medical_notes: updated.critical_medical_notes,
        emergency_instructions: updated.emergency_instructions,
        visibility_settings: visibilitySettings,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (profileError) {
      throw new Error(`Profile update error: ${profileError.message}`);
    }

    setPublicProfile(updated);
  };

  // ---------------------------------------------------------------------------
  // Credential CRUD (Zero-Knowledge AES-GCM)
  // ---------------------------------------------------------------------------
  const addCredential = async (
    cred: Omit<VaultCredential, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => {
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    const recordId = crypto.randomUUID();
    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      userId,
      recordId,
      "login",
      cred
    );

    const { error } = await supabase.from("vault_records").insert({
      user_id: userId,
      record_id: recordId,
      category: "login",
      folder_id: cred.folder_id || null,
      ciphertext: payload.ciphertext,
      salt: payload.salt,
      nonce: payload.nonce,
      auth_tag: payload.auth_tag,
      key_version: payload.key_version,
      version: 1,
    });

    if (error) throw new Error(`Failed to save record: ${error.message}`);

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
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    const existing = credentials.find((c) => c.id === id);
    if (!existing) throw new Error("Record not found");

    const merged = { ...existing, ...updates };
    const newVersion = existing.version_counter + 1;

    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      userId,
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

    // Conditional update with version check to handle multi-device 409 conflicts
    const { data, error } = await supabase
      .from("vault_records")
      .update({
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        version: newVersion,
        folder_id: merged.folder_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("record_id", id)
      .eq("version", existing.version_counter)
      .select();

    if (error || !data || data.length === 0) {
      throw new Error("409 Conflict: Record was modified on another device. Please refresh.");
    }

    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...merged, version_counter: newVersion, updated_at: new Date().toISOString() } : c))
    );
  };

  const deleteCredential = async (id: string) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: now })
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: true, deleted_at: now } : c))
    );
  };

  const restoreCredential = async (id: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, is_deleted: false, deleted_at: undefined } : c))
    );
  };

  const shredCredential = async (id: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("vault_records")
      .delete()
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setCredentials((prev) => prev.filter((c) => c.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Notes CRUD (Zero-Knowledge AES-GCM)
  // ---------------------------------------------------------------------------
  const addNote = async (
    note: Omit<VaultNote, "id" | "version_counter" | "is_deleted" | "updated_at">
  ) => {
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    const recordId = crypto.randomUUID();
    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      userId,
      recordId,
      "note",
      note
    );

    const { error } = await supabase.from("vault_records").insert({
      user_id: userId,
      record_id: recordId,
      category: "note",
      folder_id: note.folder_id || null,
      ciphertext: payload.ciphertext,
      salt: payload.salt,
      nonce: payload.nonce,
      auth_tag: payload.auth_tag,
      key_version: payload.key_version,
      version: 1,
    });

    if (error) throw new Error(`Failed to save note: ${error.message}`);

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
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    const existing = notes.find((n) => n.id === id);
    if (!existing) throw new Error("Note not found");

    const merged = { ...existing, ...updates };
    const newVersion = existing.version_counter + 1;

    const payload = await encryptRecord(
      subkeysRef.current.k_record,
      userId,
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

    const { data, error } = await supabase
      .from("vault_records")
      .update({
        ciphertext: payload.ciphertext,
        salt: payload.salt,
        nonce: payload.nonce,
        auth_tag: payload.auth_tag,
        version: newVersion,
        folder_id: merged.folder_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("record_id", id)
      .eq("version", existing.version_counter)
      .select();

    if (error || !data || data.length === 0) {
      throw new Error("409 Conflict: Note was modified on another device. Please refresh.");
    }

    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...merged, version_counter: newVersion, updated_at: new Date().toISOString() } : n))
    );
  };

  const deleteNote = async (id: string) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: now })
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_deleted: true, deleted_at: now } : n))
    );
  };

  const restoreNote = async (id: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_deleted: false, deleted_at: undefined } : n))
    );
  };

  const shredNote = async (id: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("vault_records")
      .delete()
      .eq("user_id", userId)
      .eq("record_id", id);

    if (error) throw new Error(error.message);

    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // ---------------------------------------------------------------------------
  // Files: Chunked AES-GCM + R2 Presigned URLs + Encrypted Manifest
  // ---------------------------------------------------------------------------
  const uploadFile = async (
    file: File,
    folderId?: string,
    onProgress?: (percent: number) => void
  ) => {
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    if (file.size > datakeyConfig.security.storage.maxFileSizeBytes) {
      throw new Error(`File size exceeds maximum allowed (${datakeyConfig.security.storage.maxFileSizeBytes / (1024 * 1024)} MiB)`);
    }

    const fileId = crypto.randomUUID();
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    // 1. Chunked client-side encryption
    const { manifest, chunks } = await encryptFile(
      subkeysRef.current.k_file_master,
      userId,
      fileId,
      file.name,
      file.type || "application/octet-stream",
      fileBytes,
      datakeyConfig.security.storage.chunkSizeBytes
    );

    // 2. Upload chunks to Cloudflare R2 using presigned URLs
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const presignedRes = await fetch("/api/files/presigned-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, chunkIndex: i }),
      });

      if (!presignedRes.ok) {
        throw new Error(`Failed to obtain upload URL for chunk ${i}`);
      }

      const { uploadUrl } = await presignedRes.json();
      const r2UploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([chunk.ciphertext_with_tag as unknown as BlobPart]),
      });

      if (!r2UploadRes.ok) {
        throw new Error(`Failed to upload chunk ${i} to storage.`);
      }

      onProgress?.(Math.round(((i + 1) / chunks.length) * 100));
    }

    // 3. Encrypt the file manifest as a zero-knowledge vault record
    const encryptedManifestRecord = await encryptRecord(
      subkeysRef.current.k_record,
      userId,
      fileId,
      "file_manifest",
      manifest as unknown as Record<string, unknown>
    );

    // 4. Store manifest record in vault_records
    const { error: dbError } = await supabase.from("vault_records").insert({
      user_id: userId,
      record_id: fileId,
      category: "file_manifest",
      folder_id: folderId || null,
      ciphertext: encryptedManifestRecord.ciphertext,
      salt: encryptedManifestRecord.salt,
      nonce: encryptedManifestRecord.nonce,
      auth_tag: encryptedManifestRecord.auth_tag,
      key_version: encryptedManifestRecord.key_version,
      version: 1,
    });

    if (dbError) {
      throw new Error(`Failed to register file record: ${dbError.message}`);
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
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    // 1. Fetch manifest record
    const { data: record, error: recError } = await supabase
      .from("vault_records")
      .select("*")
      .eq("user_id", userId)
      .eq("record_id", fileId)
      .single();

    if (recError || !record) throw new Error("File manifest record not found.");

    // 2. Decrypt manifest
    const manifest = await decryptRecord<AuthenticatedFileManifest>(
      subkeysRef.current.k_record,
      userId,
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

    // 3. Download and verify each chunk
    const chunks: FileChunkEncrypted[] = [];

    for (let i = 0; i < manifest.total_chunks; i++) {
      const presignedRes = await fetch("/api/files/presigned-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, chunkIndex: i }),
      });

      if (!presignedRes.ok) throw new Error(`Failed to obtain download URL for chunk ${i}`);

      const { downloadUrl } = await presignedRes.json();
      const chunkRes = await fetch(downloadUrl);
      if (!chunkRes.ok) throw new Error(`Failed to fetch chunk ${i} from storage`);

      const chunkBuffer = new Uint8Array(await chunkRes.arrayBuffer());
      const isLastChunk = i === manifest.total_chunks - 1;

      // SHA-256 validation done inside decryptFile against manifest hashes
      chunks.push({
        chunk_index: i,
        total_chunks: manifest.total_chunks,
        is_last_chunk: isLastChunk,
        ciphertext_with_tag: chunkBuffer,
        chunk_hash_sha256: manifest.chunk_hashes[i],
      });
    }

    // 4. Decrypt complete file
    const plaintextBytes = await decryptFile(
      subkeysRef.current.k_file_master,
      userId,
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
    if (!userId) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: now })
      .eq("user_id", userId)
      .eq("record_id", fileId);

    if (error) throw new Error(error.message);

    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, is_deleted: true, deleted_at: now } : f))
    );
  };

  const restoreFile = async (fileId: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("vault_records")
      .update({ deleted_at: null })
      .eq("user_id", userId)
      .eq("record_id", fileId);

    if (error) throw new Error(error.message);

    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, is_deleted: false, deleted_at: undefined } : f))
    );
  };

  const shredFile = async (fileId: string) => {
    if (!userId) return;
    const targetFile = files.find((f) => f.id === fileId);

    // 1. Delete chunks from Cloudflare R2
    if (targetFile) {
      await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, totalChunks: targetFile.total_chunks }),
      });
    }

    // 2. Delete database record
    const { error } = await supabase
      .from("vault_records")
      .delete()
      .eq("user_id", userId)
      .eq("record_id", fileId);

    if (error) throw new Error(error.message);

    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // ---------------------------------------------------------------------------
  // Transmissions & Sessions
  // ---------------------------------------------------------------------------
  const refreshTransmissions = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("finder_transmissions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data) {
      setFinderTransmissions(
        data.map((t) => ({
          id: t.id,
          finder_message: t.message,
          finder_contact_info: t.finder_contact || undefined,
          latitude: t.latitude,
          longitude: t.longitude,
          accuracy_meters: t.accuracy_meters || undefined,
          location_denied: t.location_denied,
          created_at: t.created_at,
        }))
      );
    }
  };

  const revokeSession = async () => {
    // Calls Supabase Auth sign-out
    await supabase.auth.signOut();
    lockVault();
  };

  // ---------------------------------------------------------------------------
  // Multi-Part Offline Backup Exporter
  // ---------------------------------------------------------------------------
  const exportVaultBackupPayload = async (): Promise<{ manifest: string; parts: string[] }> => {
    if (!subkeysRef.current || !userId) throw new Error("Vault locked");

    // Fetch all encrypted records for this user
    const { data: records } = await supabase
      .from("vault_records")
      .select("*")
      .eq("user_id", userId);

    const backupDate = new Date().toISOString();
    const payloadString = JSON.stringify({
      schema_version: "2.2",
      created_at: backupDate,
      user_id: userId,
      records: records || [],
    });

    const partSize = datakeyConfig.security.storage.backupPartSizeBytes;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payloadString);
    const totalParts = Math.ceil(bytes.length / partSize) || 1;

    const parts: string[] = [];
    const partHashes: string[] = [];

    for (let i = 0; i < totalParts; i++) {
      const partSlice = bytes.slice(i * partSize, (i + 1) * partSize);
      const hashBuffer = await crypto.subtle.digest("SHA-256", partSlice as unknown as BufferSource);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      partHashes.push(hashHex);

      // Part file content with headers
      const partContent = JSON.stringify({
        part_index: i + 1,
        total_parts: totalParts,
        data_base64: btoa(String.fromCharCode(...partSlice)),
        part_sha256: hashHex,
      });
      parts.push(partContent);
    }

    const manifestObj = {
      backup_date: backupDate,
      version: "2.2",
      total_parts: totalParts,
      part_hashes: partHashes,
      user_id: userId,
    };

    // Encrypt manifest under K_manifest
    const encryptedManifest = await encryptRecord(
      subkeysRef.current.k_manifest,
      userId,
      "backup_manifest",
      "system",
      manifestObj
    );

    return {
      manifest: JSON.stringify(encryptedManifest),
      parts,
    };
  };

  return (
    <VaultContext.Provider
      value={{
        userId,
        userEmail,
        aalLevel,
        isVaultUnlocked,
        autoLockCountdown,
        unlockWithVek,
        lockVault,
        publicProfile,
        credentials,
        notes,
        files,
        finderTransmissions,
        sessions,
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
        revokeSession,
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
