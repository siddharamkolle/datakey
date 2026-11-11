"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ChevronLeft,
  RefreshCw,
  Download,
  Copy,
  Check,
  Upload,
} from "lucide-react";
import { useVault } from "@/lib/vault/vaultContext";
import {
  buildRecoveryKeyFileJson,
  createSimpleVaultSetup,
  deriveSimplePasswordKeys,
  deriveSimpleRecoveryKeys,
  rewrapSimpleVekWithNewPassword,
  unwrapSimpleVekWithPassword,
  unwrapSimpleVekWithRecoveryKey,
} from "@/lib/crypto";
import { datakeyConfig } from "@config/datakey.config";

interface AuthStatusResponse {
  initialized: boolean;
  salt?: string;
  kdfIterations?: number;
  keyVersion?: number;
  hasRecoveryKey?: boolean;
  authenticated: boolean;
  dbDriver: string;
}

export default function MasterLoginPage() {
  const router = useRouter();
  const { unlockWithVek, isVaultUnlocked } = useVault();

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);

  // Setup & Login form state
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Post-setup optional recovery key download state
  const [setupCompleteRecoveryKey, setSetupCompleteRecoveryKey] = useState<string | null>(null);
  const [pendingSetupVek, setPendingSetupVek] = useState<Uint8Array | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // Recovery Modal state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // UI feedback
  const [errorMsg, setErrorMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isVaultUnlocked) {
      router.replace("/vault");
      return;
    }

    async function loadStatus() {
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as AuthStatusResponse;
          setAuthStatus(data);
        } else {
          setErrorMsg("Unable to reach vault database.");
        }
      } catch {
        setErrorMsg("Unable to check vault status.");
      } finally {
        setLoadingStatus(false);
      }
    }

    void loadStatus();
  }, [isVaultUnlocked, router]);

  // ---------------------------------------------------------------------------
  // FIRST-RUN SETUP (Simple Single Master Password)
  // ---------------------------------------------------------------------------
  const handleFirstTimeSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const minLen = datakeyConfig.security.passwords.minMasterPasswordLength;
    if (masterPassword.length < minLen) {
      setErrorMsg(`Master Password must be at least ${minLen} characters.`);
      return;
    }

    if (masterPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setIsProcessing(true);
    try {
      const { setupPayload, rawVek, recoveryKey } = await createSimpleVaultSetup(masterPassword);

      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Vault setup failed.");
      }

      setPendingSetupVek(rawVek);
      setSetupCompleteRecoveryKey(recoveryKey);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Vault initialization failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadRecoveryFile = (keyStr: string) => {
    const content = buildRecoveryKeyFileJson(keyStr);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "datakey-recovery-key.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const finishSetupAndEnterVault = () => {
    if (!pendingSetupVek) return;
    unlockWithVek(pendingSetupVek);
    router.push("/vault");
  };

  // ---------------------------------------------------------------------------
  // MASTER LOGIN (Simple 1-Step PBKDF2 + AES-GCM)
  // ---------------------------------------------------------------------------
  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!authStatus?.salt) {
      setErrorMsg("Vault configuration missing.");
      return;
    }

    setIsProcessing(true);
    try {
      const iterations = authStatus.kdfIterations || datakeyConfig.security.pbkdf2.iterations;
      const { authToken } = await deriveSimplePasswordKeys(
        masterPassword,
        authStatus.salt,
        iterations
      );

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Incorrect Master Password.");
      }

      const { vek } = await unwrapSimpleVekWithPassword(
        masterPassword,
        authStatus.salt,
        data.wrappedVekPass,
        data.ivPass,
        iterations,
        data.keyVersion || 1
      );

      unlockWithVek(vek);
      router.push("/vault");
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Login failed. Check your Master Password.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RECOVERY KEY FILE UNLOCK + PASSWORD RESET
  // ---------------------------------------------------------------------------
  const handleRecoveryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRecoveryKeyInput(text);
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const minLen = datakeyConfig.security.passwords.minMasterPasswordLength;
    if (newMasterPassword.length < minLen) {
      setErrorMsg(`New Master Password must be at least ${minLen} characters.`);
      return;
    }

    setIsProcessing(true);
    try {
      const { recovAuthToken } = deriveSimpleRecoveryKeys(recoveryKeyInput);

      // 1. Verify recovery key & fetch wrapped VEK
      const verifyRes = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", recovAuthToken }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Invalid Recovery Key.");
      }

      // 2. Unwrap VEK client-side using recovery key
      const { vek } = await unwrapSimpleVekWithRecoveryKey(
        recoveryKeyInput,
        verifyData.wrappedVekRecov,
        verifyData.ivRecov,
        verifyData.keyVersion || 1
      );

      // 3. Re-wrap VEK with the new Master Password
      const rewrapped = await rewrapSimpleVekWithNewPassword(
        newMasterPassword,
        vek,
        verifyData.keyVersion || 1
      );

      // 4. Save new wrapper on server & obtain session
      const resetRes = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          recovAuthToken,
          newSalt: rewrapped.salt,
          newAuthToken: rewrapped.authToken,
          newWrappedVekPass: rewrapped.wrappedVekPass,
          newIvPass: rewrapped.ivPass,
          newKdfIterations: rewrapped.kdfIterations,
        }),
      });

      const resetData = await resetRes.json();
      if (!resetRes.ok) {
        throw new Error(resetData.error || "Failed to reset password.");
      }

      setRecoverySuccess(true);
      setTimeout(() => {
        unlockWithVek(vek);
        setShowRecoveryModal(false);
        router.push("/vault");
      }, 700);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Recovery failed. Check your Recovery Key.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[#cdcbca]/50" />
      </div>
    );
  }

  const isFirstRun = !authStatus?.initialized;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-[#cdcbca]/60 hover:text-[#cdcbca] transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Return to Public View</span>
      </Link>

      <div className="glass-panel rounded-3xl p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
            {isFirstRun ? (
              <KeyRound className="h-6 w-6 text-[#cdcbca]" />
            ) : (
              <Lock className="h-6 w-6 text-[#cdcbca]" />
            )}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#cdcbca]">
            {setupCompleteRecoveryKey
              ? "Vault Created"
              : isFirstRun
              ? "Setup Master Password"
              : "Master Login"}
          </h1>
          <p className="text-xs text-[#cdcbca]/75 mt-1">
            {setupCompleteRecoveryKey
              ? "Optional: Save a backup Recovery Key file before entering"
              : isFirstRun
              ? "Create one Master Password to lock & encrypt your vault"
              : "Enter your Master Password to unlock your encrypted vault"}
          </p>
          <p className="text-[10px] font-mono text-[#cdcbca]/50 mt-1.5">
            PBKDF2-SHA256 + AES-256-GCM • DB: {(authStatus?.dbDriver || "sqlite").toUpperCase()}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="glass-state-error mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs text-[#cdcbca] leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#cdcbca]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* POST-SETUP OPTIONAL RECOVERY KEY STEP */}
        {setupCompleteRecoveryKey ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#cdcbca]">
                  Recovery Key (Optional Backup)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(setupCompleteRecoveryKey);
                    setCopiedRecovery(true);
                    setTimeout(() => setCopiedRecovery(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-[#cdcbca]/70 hover:text-[#cdcbca]"
                >
                  {copiedRecovery ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedRecovery ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="rounded-lg border border-[#cdcbca]/15 bg-[#080808] p-2.5 font-mono text-[11px] text-[#cdcbca]/90 break-all">
                {setupCompleteRecoveryKey}
              </div>
              <p className="text-[11px] text-[#cdcbca]/60 leading-relaxed">
                Keep this file safe if you ever want to reset a forgotten Master Password. You can also download or regenerate it anytime inside your vault.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleDownloadRecoveryFile(setupCompleteRecoveryKey)}
              className="glass-button-secondary w-full rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span>Download Recovery Key (.json)</span>
            </button>

            <button
              type="button"
              onClick={finishSetupAndEnterVault}
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <span>Enter Private Vault</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : isFirstRun ? (
          /* FIRST-RUN SETUP FORM */
          <form onSubmit={handleFirstTimeSetup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">
                Master Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  required
                  minLength={datakeyConfig.security.passwords.minMasterPasswordLength}
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono"
                  placeholder={`At least ${datakeyConfig.security.passwords.minMasterPasswordLength} characters`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-2.5 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">
                Confirm Master Password
              </label>
              <input
                type={showPass ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm font-mono"
                placeholder="Re-enter Master Password"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Deriving Keys & Creating Vault...</span>
                </>
              ) : (
                <>
                  <span>Create Vault & Continue</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* RETURNING MASTER LOGIN FORM */
          <form onSubmit={handleMasterLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">
                Master Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  required
                  autoFocus
                  className="glass-input w-full rounded-xl px-3.5 py-3 pr-10 text-sm font-mono"
                  placeholder="Enter your Master Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-3 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Decrypting Vault Key...</span>
                </>
              ) : (
                <>
                  <span>Unlock Vault</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {authStatus?.hasRecoveryKey && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg("");
                    setShowRecoveryModal(true);
                  }}
                  className="text-xs text-[#cdcbca]/70 hover:text-[#cdcbca] underline"
                >
                  Forgot Master Password? Use Recovery Key File
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* RECOVERY MODAL */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-[#cdcbca]/30">
            <h2 className="text-base font-bold text-[#cdcbca] mb-1">Recover Vault Access</h2>
            <p className="text-xs text-[#cdcbca]/70 mb-4">
              Upload your <code className="font-mono">datakey-recovery-key.json</code> file or paste your recovery key, then set a new Master Password.
            </p>

            <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
              <div>
                <label className="glass-button-secondary inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs mb-2">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Load Recovery Key File (.json)</span>
                  <input
                    type="file"
                    accept=".json,.txt"
                    onChange={handleRecoveryFileUpload}
                    className="hidden"
                  />
                </label>
                <textarea
                  rows={3}
                  value={recoveryKeyInput}
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  required
                  placeholder="DK-XXXX-XXXX-... or paste JSON contents"
                  className="glass-input w-full rounded-xl p-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  New Master Password (min {datakeyConfig.security.passwords.minMasterPasswordLength} chars)
                </label>
                <input
                  type="password"
                  value={newMasterPassword}
                  onChange={(e) => setNewMasterPassword(e.target.value)}
                  required
                  placeholder="Enter new Master Password"
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </div>

              {recoverySuccess && (
                <div className="glass-state-success rounded-xl p-3 text-xs text-[#cdcbca] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Vault recovered! Opening dashboard...</span>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="glass-button-secondary rounded-xl px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="glass-button-primary rounded-xl px-4 py-2 text-xs font-semibold"
                >
                  {isProcessing ? "Recovering..." : "Reset & Unlock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
