"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  KeyRound,
  FileText,
  FileBox,
  MapPin,
  Trash2,
  Download,
  Lock,
  Plus,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Clock,
  X,
  Upload,
  AlertOctagon,
  ShieldAlert,
  Globe,
  Pencil,
  CheckCircle2,
  Save,
} from "lucide-react";
import { useVault } from "@/lib/vault/vaultContext";
import type { PublicEmergencyProfile, VaultCredential, VaultNote } from "@/lib/vault/vaultState";
import PublicViewEditor from "@/components/vault/PublicViewEditor";
import { buildRecoveryKeyFileJson } from "@/lib/crypto";

type VaultTab =
  | "publicView"
  | "passwords"
  | "notes"
  | "files"
  | "emergency"
  | "transmissions"
  | "trash"
  | "security"
  | "backup";

export default function PrivateVaultDashboard() {
  const router = useRouter();
  const {
    isVaultUnlocked,
    lockVault,
    autoLockCountdown,
    dbDriver,
    publicProfile,
    toggleLostMode,
    updatePublicProfile,
    credentials,
    notes,
    files,
    finderTransmissions,
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
  } = useVault();

  const [activeTab, setActiveTab] = useState<VaultTab>("passwords");

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Masking & Toast
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);

  // Modals
  const [showCredModal, setShowCredModal] = useState(false);
  const [editingCredId, setEditingCredId] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Credential Form
  const [credTitle, setCredTitle] = useState("");
  const [credCategory, setCredCategory] = useState<VaultCredential["category"]>("Banking");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credUrl, setCredUrl] = useState("");
  const [credNotes, setCredNotes] = useState("");

  // Note Form
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTag, setNoteTag] = useState("Confidential");

  // File Upload
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Lost Mode Editor
  const [lostDraft, setLostDraft] = useState<PublicEmergencyProfile | null>(null);
  const lostForm = lostDraft ?? publicProfile;
  const setLostForm = (
    updater:
      | PublicEmergencyProfile
      | ((prev: PublicEmergencyProfile) => PublicEmergencyProfile)
  ) => {
    setLostDraft((prev) =>
      typeof updater === "function" ? updater(prev ?? publicProfile) : updater
    );
  };
  const [savingLost, setSavingLost] = useState(false);
  const [lostSavedMsg, setLostSavedMsg] = useState("");

  // Security & Recovery Tab state
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmNewPass, setConfirmNewPass] = useState("");
  const [passChangeMsg, setPassChangeMsg] = useState("");
  const [passChangeErr, setPassChangeErr] = useState("");
  const [changingPass, setChangingPass] = useState(false);
  const [freshRecoveryKey, setFreshRecoveryKey] = useState<string | null>(null);
  const [generatingRecov, setGeneratingRecov] = useState(false);

  useEffect(() => {
    if (!isVaultUnlocked) {
      router.push("/vault/login");
    }
  }, [isVaultUnlocked, router]);

  const handleCopySecret = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setClipboardNotice(`${label} copied! Auto-clearing clipboard in 30 seconds.`);

    setTimeout(() => {
      try {
        navigator.clipboard.writeText("");
        setClipboardNotice(null);
      } catch {
        // clipboard timeout
      }
    }, 30000);
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openCreateCredentialModal = () => {
    setEditingCredId(null);
    setCredTitle("");
    setCredCategory("Banking");
    setCredUsername("");
    setCredPassword("");
    setCredUrl("");
    setCredNotes("");
    setShowCredModal(true);
  };

  const openEditCredentialModal = (c: VaultCredential) => {
    setEditingCredId(c.id);
    setCredTitle(c.title);
    setCredCategory(c.category);
    setCredUsername(c.username);
    setCredPassword(c.password);
    setCredUrl(c.url || "");
    setCredNotes(c.notes || "");
    setShowCredModal(true);
  };

  const handleSaveCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credTitle.trim() || !credPassword.trim()) return;

    try {
      if (editingCredId) {
        await updateCredential(editingCredId, {
          title: credTitle.trim(),
          category: credCategory,
          username: credUsername.trim(),
          password: credPassword.trim(),
          url: credUrl.trim() || undefined,
          notes: credNotes.trim() || undefined,
        });
      } else {
        await addCredential({
          title: credTitle.trim(),
          category: credCategory,
          username: credUsername.trim(),
          password: credPassword.trim(),
          url: credUrl.trim() || undefined,
          notes: credNotes.trim() || undefined,
        });
      }
      setShowCredModal(false);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to save credential.");
    }
  };

  const openCreateNoteModal = () => {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteTag("Confidential");
    setShowNoteModal(true);
  };

  const openEditNoteModal = (n: VaultNote) => {
    setEditingNoteId(n.id);
    setNoteTitle(n.title);
    setNoteContent(n.content);
    setNoteTag(n.tags?.[0] || "Confidential");
    setShowNoteModal(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;

    try {
      if (editingNoteId) {
        await updateNote(editingNoteId, {
          title: noteTitle.trim(),
          content: noteContent.trim(),
          tags: [noteTag.trim() || "Confidential"],
        });
      } else {
        await addNote({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          tags: [noteTag.trim() || "Confidential"],
          is_pinned: false,
        });
      }
      setShowNoteModal(false);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to save note.");
    }
  };

  const handleRealFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError("");

    try {
      await uploadFile(selectedUploadFile, undefined, (percent) => {
        setUploadProgress(percent);
      });
      setSelectedUploadFile(null);
      setShowUploadModal(false);
    } catch (err: unknown) {
      setUploadError((err as Error).message || "File upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRealFileDownload = async (fileId: string) => {
    setDownloadingFileId(fileId);
    try {
      const { data, fileName, mimeType } = await downloadFile(fileId);
      const blob = new Blob([data as unknown as BlobPart], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(`File decryption failed: ${(err as Error).message}`);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassChangeErr("");
    setPassChangeMsg("");

    if (newPass !== confirmNewPass) {
      setPassChangeErr("New passwords do not match.");
      return;
    }

    setChangingPass(true);
    try {
      await changeMasterPassword(curPass, newPass);
      setCurPass("");
      setNewPass("");
      setConfirmNewPass("");
      setPassChangeMsg("Master Password updated successfully! Existing items required zero re-encryption.");
    } catch (err: unknown) {
      setPassChangeErr((err as Error).message || "Failed to update password.");
    } finally {
      setChangingPass(false);
    }
  };

  const handleRegenerateRecovery = async () => {
    setGeneratingRecov(true);
    try {
      const key = await regenerateRecoveryKey();
      setFreshRecoveryKey(key);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to generate recovery key.");
    } finally {
      setGeneratingRecov(false);
    }
  };

  const handleDownloadRecoveryJson = (keyStr: string) => {
    const content = buildRecoveryKeyFileJson(keyStr);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "datakey-recovery-key.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBackup = async () => {
    try {
      const { manifest, parts } = await exportVaultBackupPayload();
      const dateStr = new Date().toISOString().split("T")[0];

      const manifestBlob = new Blob([manifest], { type: "application/json" });
      const mUrl = URL.createObjectURL(manifestBlob);
      const ma = document.createElement("a");
      ma.href = mUrl;
      ma.download = `datakey-backup-${dateStr}.manifest.json`;
      ma.click();
      URL.revokeObjectURL(mUrl);

      parts.forEach((partContent, i) => {
        setTimeout(() => {
          const partBlob = new Blob([partContent], { type: "application/json" });
          const pUrl = URL.createObjectURL(partBlob);
          const pa = document.createElement("a");
          pa.href = pUrl;
          pa.download = `datakey-backup-${dateStr}.part${i + 1}`;
          pa.click();
          URL.revokeObjectURL(pUrl);
        }, (i + 1) * 300);
      });
    } catch (err: unknown) {
      alert(`Backup generation failed: ${(err as Error).message}`);
    }
  };

  if (!isVaultUnlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel rounded-3xl p-8 max-w-sm w-full text-center">
          <Lock className="mx-auto h-10 w-10 text-[#cdcbca] mb-3" />
          <h2 className="text-base font-bold text-[#cdcbca]">Vault Locked</h2>
          <p className="text-xs text-[#cdcbca]/70 mt-1 mb-4">
            Volatile RAM keys have been purged. Enter Master Password to unlock.
          </p>
          <Link
            href="/vault/login"
            className="glass-button-primary inline-flex w-full justify-center rounded-xl py-2.5 text-xs font-semibold"
          >
            Master Login
          </Link>
        </div>
      </div>
    );
  }

  const activeCredentials = credentials.filter((c) => !c.is_deleted);
  const activeNotes = notes.filter((n) => !n.is_deleted);
  const activeFiles = files.filter((f) => !f.is_deleted);

  const deletedCredentials = credentials.filter((c) => c.is_deleted);
  const deletedNotes = notes.filter((n) => n.is_deleted);
  const deletedFiles = files.filter((f) => f.is_deleted);
  const totalTrashCount = deletedCredentials.length + deletedNotes.length + deletedFiles.length;

  const filteredCredentials = activeCredentials.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[#080808] text-[#cdcbca] px-3 py-4 sm:px-6 sm:py-6">
      {/* Top Bar */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
            <Shield className="h-5 w-5 text-[#cdcbca]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-[#cdcbca]">
                DataKey Private Vault
              </span>
              <span className="rounded border border-[#cdcbca]/30 bg-[#cdcbca]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#cdcbca]">
                AES-256-GCM
              </span>
            </div>
            <p className="text-[11px] text-[#cdcbca]/60">
              Volatile RAM Keys • DB: {dbDriver.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-[#cdcbca]/15 bg-[#080808] px-2.5 py-1 text-xs font-mono text-[#cdcbca]/80">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Auto-Lock: {Math.floor(autoLockCountdown / 60)}:
              {(autoLockCountdown % 60).toString().padStart(2, "0")}
            </span>
          </div>

          <Link
            href="/"
            className="glass-button-outline flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Public View</span>
          </Link>

          <button
            onClick={() => void lockVault(true)}
            className="glass-button-danger flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Lock Now</span>
          </button>
        </div>
      </header>

      {/* Clipboard Notice */}
      {clipboardNotice && (
        <div className="mb-4 rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10 p-2.5 text-center text-xs text-[#cdcbca]">
          {clipboardNotice}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 space-y-1.5">
          <button
            onClick={() => setActiveTab("publicView")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "publicView"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Globe className="h-4 w-4" />
              <span>Public View</span>
            </div>
            <span className="rounded bg-[#cdcbca]/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#cdcbca]/80">
              First Page
            </span>
          </button>

          <button
            onClick={() => setActiveTab("passwords")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "passwords"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4" />
              <span>Passwords & Logins</span>
            </div>
            <span className="font-mono text-[11px] text-[#cdcbca]/50">{activeCredentials.length}</span>
          </button>

          <button
            onClick={() => setActiveTab("notes")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "notes"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4" />
              <span>Confidential Notes</span>
            </div>
            <span className="font-mono text-[11px] text-[#cdcbca]/50">{activeNotes.length}</span>
          </button>

          <button
            onClick={() => setActiveTab("files")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "files"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileBox className="h-4 w-4" />
              <span>Encrypted Files</span>
            </div>
            <span className="font-mono text-[11px] text-[#cdcbca]/50">{activeFiles.length}</span>
          </button>

          <button
            onClick={() => setActiveTab("emergency")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "emergency"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-4 w-4" />
              <span>Emergency & Lost Mode</span>
            </div>
            {publicProfile.is_lost_mode && (
              <span className="rounded bg-[#cdcbca]/20 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#cdcbca]">
                LOST
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("transmissions");
              void refreshTransmissions();
            }}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "transmissions"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <MapPin className="h-4 w-4" />
              <span>Finder Transmissions</span>
            </div>
            <span className="font-mono text-[11px] text-[#cdcbca]/50">
              {finderTransmissions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("trash")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "trash"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Trash2 className="h-4 w-4" />
              <span>Recycle Bin (30 Days)</span>
            </div>
            <span className="font-mono text-[11px] text-[#cdcbca]/50">{totalTrashCount}</span>
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "security"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4" />
              <span>Security & Recovery</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab("backup")}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all ${
              activeTab === "backup"
                ? "border border-[#cdcbca] bg-[#cdcbca]/15 text-[#cdcbca]"
                : "border border-transparent text-[#cdcbca]/70 hover:bg-[#cdcbca]/5 hover:text-[#cdcbca]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Download className="h-4 w-4" />
              <span>Offline Backup & Tool</span>
            </div>
          </button>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-9">
          {/* TAB 0: PUBLIC VIEW EDITOR */}
          {activeTab === "publicView" && (
            <PublicViewEditor profile={publicProfile} onSave={updatePublicProfile} />
          )}

          {/* TAB 1: PASSWORDS */}
          {activeTab === "passwords" && (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-[#cdcbca]" />
                  <h2 className="text-sm font-bold text-[#cdcbca]">Credentials & Passwords</h2>
                </div>
                <button
                  onClick={openCreateCredentialModal}
                  className="glass-button-primary flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Credential</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search credentials..."
                  className="glass-input flex-1 min-w-[180px] rounded-xl px-3 py-1.5 text-xs"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="glass-input rounded-xl px-3 py-1.5 text-xs bg-[#080808]"
                >
                  <option value="All">All Categories</option>
                  <option value="Banking">Banking</option>
                  <option value="Cloud">Cloud</option>
                  <option value="Email">Email</option>
                  <option value="Wi-Fi">Wi-Fi</option>
                  <option value="Social">Social</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {filteredCredentials.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#cdcbca]/50">
                  {searchQuery || selectedCategory !== "All"
                    ? "No credentials match your search filter."
                    : "No credentials stored yet. Click 'Add Credential' to encrypt your first login."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCredentials.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[#cdcbca]">{c.title}</span>
                          <span className="rounded bg-[#080808] border border-[#cdcbca]/20 px-1.5 py-0.2 text-[9px] font-mono text-[#cdcbca]/70">
                            {c.category}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[#cdcbca]/70 flex flex-wrap items-center gap-3">
                          <span>User: {c.username || "—"}</span>
                          <span className="text-[#cdcbca]/30">•</span>
                          <span>
                            Pass: {revealedPasswords[c.id] ? c.password : "••••••••••••"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => togglePasswordReveal(c.id)}
                          className="glass-button-secondary rounded-lg p-1.5 text-xs"
                          title="Reveal / Mask Password"
                        >
                          {revealedPasswords[c.id] ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleCopySecret(c.password, `${c.title} Password`)}
                          className="glass-button-secondary rounded-lg p-1.5 text-xs"
                          title="Copy Password"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEditCredentialModal(c)}
                          className="glass-button-secondary rounded-lg p-1.5 text-xs"
                          title="Edit Credential"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => void deleteCredential(c.id)}
                          className="glass-button-secondary rounded-lg p-1.5 text-xs text-[#cdcbca]/60 hover:text-[#cdcbca]"
                          title="Move to Recycle Bin"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NOTES */}
          {activeTab === "notes" && (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#cdcbca]" />
                  <h2 className="text-sm font-bold text-[#cdcbca]">Confidential Notes</h2>
                </div>
                <button
                  onClick={openCreateNoteModal}
                  className="glass-button-primary flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Note</span>
                </button>
              </div>

              {activeNotes.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#cdcbca]/50">
                  No confidential notes stored yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeNotes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3.5 space-y-2 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs text-[#cdcbca]">{n.title}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openEditNoteModal(n)}
                              className="text-[#cdcbca]/50 hover:text-[#cdcbca]"
                              title="Edit Note"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void deleteNote(n.id)}
                              className="text-[#cdcbca]/40 hover:text-[#cdcbca]"
                              title="Delete Note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#cdcbca]/80 whitespace-pre-wrap font-mono line-clamp-4">
                          {n.content}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-[#cdcbca]/10 text-[10px] text-[#cdcbca]/50 font-mono">
                        <span>Tag: {n.tags?.[0] || "Confidential"}</span>
                        <button
                          onClick={() => handleCopySecret(n.content, `${n.title} Content`)}
                          className="hover:text-[#cdcbca] underline flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ENCRYPTED FILES */}
          {activeTab === "files" && (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileBox className="h-5 w-5 text-[#cdcbca]" />
                  <h2 className="text-sm font-bold text-[#cdcbca]">
                    Encrypted Files (Database Storage)
                  </h2>
                </div>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="glass-button-primary flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  <Upload className="h-4 w-4" />
                  <span>Upload File</span>
                </button>
              </div>

              {activeFiles.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#cdcbca]/50">
                  No encrypted files in storage. Files are encrypted client-side with AES-256-GCM and stored securely inside your database.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeFiles.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-xs text-[#cdcbca]">{f.file_name}</div>
                        <div className="text-[10px] font-mono text-[#cdcbca]/60">
                          Size: {(f.file_size / 1024).toFixed(1)} KB • {f.total_chunks} Chunks • AES-256-GCM
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void handleRealFileDownload(f.id)}
                          disabled={downloadingFileId === f.id}
                          className="glass-button-primary flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs"
                        >
                          {downloadingFileId === f.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          <span>Decrypt & Download</span>
                        </button>
                        <button
                          onClick={() => void deleteFile(f.id)}
                          className="glass-button-secondary rounded-lg p-1.5 text-xs text-[#cdcbca]/60 hover:text-[#cdcbca]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EMERGENCY & LOST MODE */}
          {activeTab === "emergency" && (
            <div className="glass-panel rounded-2xl p-5 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[#cdcbca]">Emergency & Lost Mode</h2>
                  <p className="text-xs text-[#cdcbca]/60 mt-0.5">
                    Instantly conceal personal medical, links, and contact details on the public page if your keychain or device is lost.
                  </p>
                </div>

                <button
                  onClick={async () => {
                    await toggleLostMode(!publicProfile.is_lost_mode);
                  }}
                  className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    publicProfile.is_lost_mode
                      ? "glass-button-danger border-2 border-[#cdcbca]"
                      : "glass-button-secondary"
                  }`}
                >
                  <AlertOctagon className="h-4 w-4" />
                  <span>{publicProfile.is_lost_mode ? "LOST MODE ACTIVE (Turn Off)" : "Enable Lost Mode"}</span>
                </button>
              </div>

              {publicProfile.is_lost_mode && (
                <div className="glass-lost-mode rounded-xl p-3 text-xs text-[#cdcbca] leading-relaxed">
                  <strong>Lost Mode is currently ACTIVE.</strong> The server hides your phone number, email, custom links, blood group, allergies, medical notes, and emergency contacts from the public page. Only the lost alert banner and finder message form remain visible.
                </div>
              )}

              <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                    Lost Mode Alert Banner Title
                  </label>
                  <input
                    type="text"
                    value={lostForm.lost_banner_title}
                    onChange={(e) =>
                      setLostForm((prev) => ({ ...prev, lost_banner_title: e.target.value }))
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                    Lost / Emergency Instructions
                  </label>
                  <textarea
                    rows={3}
                    value={lostForm.emergency_instructions}
                    onChange={(e) =>
                      setLostForm((prev) => ({
                        ...prev,
                        emergency_instructions: e.target.value,
                      }))
                    }
                    className="glass-input w-full rounded-xl p-2.5 text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={async () => {
                      setSavingLost(true);
                      setLostSavedMsg("");
                      try {
                        await updatePublicProfile(lostForm);
                        setLostDraft(null);
                        setLostSavedMsg("Lost Mode settings saved.");
                        setTimeout(() => setLostSavedMsg(""), 3000);
                      } catch (err: unknown) {
                        alert((err as Error).message);
                      } finally {
                        setSavingLost(false);
                      }
                    }}
                    disabled={savingLost}
                    className="glass-button-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{savingLost ? "Saving..." : "Save Lost Mode Settings"}</span>
                  </button>
                  {lostSavedMsg && <span className="text-xs text-[#cdcbca]">{lostSavedMsg}</span>}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FINDER TRANSMISSIONS */}
          {activeTab === "transmissions" && (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#cdcbca]">
                    Finder Transmissions & GPS Logs
                  </h2>
                  <p className="text-xs text-[#cdcbca]/60 mt-0.5">
                    Messages and locations sent from your first page.
                  </p>
                </div>
                <button
                  onClick={() => void refreshTransmissions()}
                  className="glass-button-secondary rounded-lg px-2.5 py-1 text-xs flex items-center gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {finderTransmissions.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#cdcbca]/50">
                  No messages received yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {finderTransmissions.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#cdcbca]/50 font-mono">
                        <span>Reported: {new Date(t.created_at).toLocaleString()}</span>
                        <div className="flex items-center gap-3">
                          <span>{t.location_denied ? "GPS: Not attached" : "GPS: Attached"}</span>
                          <button
                            onClick={() => void deleteTransmission(t.id)}
                            className="text-[#cdcbca]/50 hover:text-[#cdcbca]"
                            title="Delete message"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-[#cdcbca] font-medium leading-relaxed">
                        &quot;{t.finder_message}&quot;
                      </p>
                      {t.finder_contact_info && (
                        <div className="text-[11px] text-[#cdcbca]/70 font-mono">
                          Contact: {t.finder_contact_info}
                        </div>
                      )}
                      {t.latitude && t.longitude && (
                        <div className="pt-1">
                          <a
                            href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-[#cdcbca] underline"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>
                              View Location (~{Math.round(t.accuracy_meters || 0)}m accuracy)
                            </span>
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: RECYCLE BIN */}
          {activeTab === "trash" && (
            <div className="glass-panel rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#cdcbca]">
                  Recycle Bin (30-Day Retention Policy)
                </h2>
                <p className="text-xs text-[#cdcbca]/60 mt-0.5">
                  Restore deleted records or shred them permanently from the database.
                </p>
              </div>

              {totalTrashCount === 0 ? (
                <div className="py-12 text-center text-xs text-[#cdcbca]/50">
                  Recycle Bin is empty.
                </div>
              ) : (
                <div className="space-y-2">
                  {deletedCredentials.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-[#cdcbca]">[Credential] {c.title}</span>
                        <div className="text-[10px] text-[#cdcbca]/50 font-mono">
                          Deleted: {c.deleted_at ? new Date(c.deleted_at).toLocaleDateString() : "Recently"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void restoreCredential(c.id)}
                          className="glass-button-secondary rounded-lg px-2 py-1 text-xs"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => void shredCredential(c.id)}
                          className="glass-button-danger rounded-lg px-2 py-1 text-xs"
                        >
                          Shred Permanently
                        </button>
                      </div>
                    </div>
                  ))}

                  {deletedNotes.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-[#cdcbca]">[Note] {n.title}</span>
                        <div className="text-[10px] text-[#cdcbca]/50 font-mono">
                          Deleted: {n.deleted_at ? new Date(n.deleted_at).toLocaleDateString() : "Recently"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void restoreNote(n.id)}
                          className="glass-button-secondary rounded-lg px-2 py-1 text-xs"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => void shredNote(n.id)}
                          className="glass-button-danger rounded-lg px-2 py-1 text-xs"
                        >
                          Shred Permanently
                        </button>
                      </div>
                    </div>
                  ))}

                  {deletedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-xl border border-[#cdcbca]/15 bg-[#cdcbca]/5 p-3 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-[#cdcbca]">[File] {f.file_name}</span>
                        <div className="text-[10px] text-[#cdcbca]/50 font-mono">
                          Deleted: {f.deleted_at ? new Date(f.deleted_at).toLocaleDateString() : "Recently"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => void restoreFile(f.id)}
                          className="glass-button-secondary rounded-lg px-2 py-1 text-xs"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => void shredFile(f.id)}
                          className="glass-button-danger rounded-lg px-2 py-1 text-xs"
                        >
                          Shred Permanently
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: SECURITY & RECOVERY */}
          {activeTab === "security" && (
            <div className="glass-panel rounded-2xl p-5 space-y-6">
              <div>
                <h2 className="text-sm font-bold text-[#cdcbca]">Security & Recovery Key</h2>
                <p className="text-xs text-[#cdcbca]/60 mt-0.5">
                  Manage your Master Password, download a fresh Recovery Key file, or lock your session.
                </p>
              </div>

              {/* Change Master Password */}
              <form
                onSubmit={handleChangePassword}
                className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-3"
              >
                <h3 className="text-xs font-semibold text-[#cdcbca]">Change Master Password</h3>
                {passChangeErr && (
                  <div className="glass-state-error rounded-xl p-2.5 text-xs text-[#cdcbca]">
                    {passChangeErr}
                  </div>
                )}
                {passChangeMsg && (
                  <div className="glass-state-success rounded-xl p-2.5 text-xs text-[#cdcbca] flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{passChangeMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="password"
                    required
                    value={curPass}
                    onChange={(e) => setCurPass(e.target.value)}
                    placeholder="Current Master Password"
                    className="glass-input rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="password"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="New Master Password"
                    className="glass-input rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <input
                    type="password"
                    required
                    value={confirmNewPass}
                    onChange={(e) => setConfirmNewPass(e.target.value)}
                    placeholder="Confirm New Password"
                    className="glass-input rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={changingPass}
                  className="glass-button-primary rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  {changingPass ? "Updating..." : "Update Master Password"}
                </button>
              </form>

              {/* Recovery Key File */}
              <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-[#cdcbca]">
                  Downloadable Recovery Key File
                </h3>
                <p className="text-[11px] text-[#cdcbca]/70 leading-relaxed">
                  Generate a fresh 256-bit Recovery Key file if you misplaced your previous one. Regenerating invalidates any older recovery key file.
                </p>

                {freshRecoveryKey && (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-[#cdcbca]/20 bg-[#080808] p-2.5 font-mono text-[11px] text-[#cdcbca] break-all">
                      {freshRecoveryKey}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadRecoveryJson(freshRecoveryKey)}
                      className="glass-button-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download datakey-recovery-key.json</span>
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleRegenerateRecovery}
                  disabled={generatingRecov}
                  className="glass-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${generatingRecov ? "animate-spin" : ""}`} />
                  <span>
                    {generatingRecov ? "Generating..." : "Generate New Recovery Key File"}
                  </span>
                </button>
              </div>

              {/* Active Session Box */}
              <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-[#cdcbca]">Current Browser Session</div>
                  <div className="text-[11px] text-[#cdcbca]/60 font-mono mt-0.5">
                    Signed HttpOnly Session • Volatile RAM Key Active
                  </div>
                </div>
                <button
                  onClick={() => void lockVault(true)}
                  className="glass-button-danger rounded-xl px-3 py-1.5 text-xs"
                >
                  Lock & Sign Out
                </button>
              </div>
            </div>
          )}

          {/* TAB 8: OFFLINE BACKUP & STANDALONE TOOL */}
          {activeTab === "backup" && (
            <div className="glass-panel rounded-2xl p-5 space-y-6">
              <div>
                <h2 className="text-sm font-bold text-[#cdcbca]">
                  Offline Multi-Part Backup & Decryptor
                </h2>
                <p className="text-xs text-[#cdcbca]/60 mt-0.5">
                  Export encrypted backups and decrypt them 100% offline with your Master Password or Recovery Key.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-3">
                  <div className="font-semibold text-xs text-[#cdcbca]">
                    1. Download Offline Decryptor
                  </div>
                  <p className="text-[11px] text-[#cdcbca]/70 leading-relaxed">
                    A standalone HTML file containing zero user data. Opens offline in any browser to decrypt your backup parts.
                  </p>
                  <a
                    href="/datakey-offline.html"
                    download="datakey-offline.html"
                    className="glass-button-secondary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download datakey-offline.html</span>
                  </a>
                </div>

                <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-3">
                  <div className="font-semibold text-xs text-[#cdcbca]">
                    2. Export Encrypted Backup Parts
                  </div>
                  <p className="text-[11px] text-[#cdcbca]/70 leading-relaxed">
                    Downloads your encrypted vault records and wrapped key envelope into authenticated backup files.
                  </p>
                  <button
                    onClick={handleExportBackup}
                    className="glass-button-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
                  >
                    <Download className="h-4 w-4" />
                    <span>Generate & Download Backup</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD / EDIT CREDENTIAL */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-[#cdcbca]/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#cdcbca]">
                {editingCredId ? "Edit Credential" : "Add New Credential"}
              </h3>
              <button
                onClick={() => setShowCredModal(false)}
                className="text-[#cdcbca]/60 hover:text-[#cdcbca]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCredential} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  Title / Service
                </label>
                <input
                  type="text"
                  required
                  value={credTitle}
                  onChange={(e) => setCredTitle(e.target.value)}
                  placeholder="e.g. GitHub"
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">Category</label>
                <select
                  value={credCategory}
                  onChange={(e) =>
                    setCredCategory(e.target.value as VaultCredential["category"])
                  }
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs bg-[#080808]"
                >
                  <option value="Banking">Banking</option>
                  <option value="Cloud">Cloud</option>
                  <option value="Email">Email</option>
                  <option value="Wi-Fi">Wi-Fi</option>
                  <option value="Social">Social</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  Username / Email
                </label>
                <input
                  type="text"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                  placeholder="user@example.com"
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  URL (optional)
                </label>
                <input
                  type="text"
                  value={credUrl}
                  onChange={(e) => setCredUrl(e.target.value)}
                  placeholder="https://..."
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCredModal(false)}
                  className="glass-button-secondary rounded-xl px-3.5 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-button-primary rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                >
                  Encrypt & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT NOTE */}
      {showNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-[#cdcbca]/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#cdcbca]">
                {editingNoteId ? "Edit Confidential Note" : "Create Confidential Note"}
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-[#cdcbca]/60 hover:text-[#cdcbca]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g. Server Access Codes"
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">Tag</label>
                <input
                  type="text"
                  value={noteTag}
                  onChange={(e) => setNoteTag(e.target.value)}
                  placeholder="Confidential"
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">Content</label>
                <textarea
                  rows={5}
                  required
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Type confidential note..."
                  className="glass-input w-full rounded-xl p-3 text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoteModal(false)}
                  className="glass-button-secondary rounded-xl px-3.5 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-button-primary rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                >
                  Encrypt & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: UPLOAD FILE */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-[#cdcbca]/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#cdcbca]">Upload Encrypted File</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-[#cdcbca]/60 hover:text-[#cdcbca]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRealFileUpload} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  Select File
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedUploadFile(e.target.files[0]);
                    }
                  }}
                  className="glass-input w-full rounded-xl p-2 text-xs"
                />
              </div>

              {selectedUploadFile && (
                <div className="text-[11px] font-mono text-[#cdcbca]/70">
                  Size: {(selectedUploadFile.size / 1024).toFixed(1)} KB (Max 25 MiB)
                </div>
              )}

              {uploadError && (
                <div className="glass-state-error rounded-xl p-2.5 text-xs text-[#cdcbca]">
                  {uploadError}
                </div>
              )}

              {isUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-[#cdcbca]/70">
                    <span>Encrypting chunks & saving to database...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#080808] border border-[#cdcbca]/20 overflow-hidden">
                    <div
                      className="h-full bg-[#cdcbca] transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                  className="glass-button-secondary rounded-xl px-3.5 py-1.5 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedUploadFile}
                  className="glass-button-primary rounded-xl px-3.5 py-1.5 text-xs font-semibold"
                >
                  {isUploading ? "Encrypting..." : "Encrypt & Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
