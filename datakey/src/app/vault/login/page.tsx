"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Shield,
  KeyRound,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  ChevronLeft,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { useVault } from "@/lib/vault/vaultContext";
import { createClient } from "@/lib/supabase/client";
import {
  isValidMnemonic,
  generate24WordMnemonic,
  createVaultEnvelope,
  unwrapVekWithRecoveryPhrase,
  rewrapVekWithNewPassword,
  unwrapVekWithWorker,
  type VaultEnvelope,
} from "@/lib/crypto";
import { datakeyConfig } from "@config/datakey.config";

export default function OwnerLoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { unlockWithVek } = useVault();

  // Mode: Registration (First-run) vs Login (Existing owner)
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);

  // Authentication Step
  // Login: 1 (Account) -> 2 (TOTP 2FA) -> 3 (Master Password)
  // Registration: 1 (Credentials) -> 2 (BIP-39 Phrase Confirmation) -> 3 (TOTP Enrollment)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Fields (NO PRE-FILLED SENSITIVE PASSWORDS)
  const [email, setEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showAccountPass, setShowAccountPass] = useState(false);
  const [showMasterPass, setShowMasterPass] = useState(false);

  // First-run Registration State
  const [generatedPhrase, setGeneratedPhrase] = useState<string[]>([]);
  const [challengeIndices, setChallengeIndices] = useState<number[]>([]);
  const [challengeAnswers, setChallengeAnswers] = useState<Record<number, string>>({});
  const [phraseCopied, setPhraseCopied] = useState(false);
  const [totpEnrollData, setTotpEnrollData] = useState<{ id: string; secret: string; qr: string } | null>(null);

  // Active Login State
  const [currentFactorId, setCurrentFactorId] = useState<string | null>(null);
  const [currentChallengeId, setCurrentChallengeId] = useState<string | null>(null);
  const [cachedEnvelope, setCachedEnvelope] = useState<VaultEnvelope | null>(null);

  // Status & Error Feedback (Monochrome)
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [cryptoStatusText, setCryptoStatusText] = useState("");

  // Recovery Modal
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryPhraseInput, setRecoveryPhraseInput] = useState("");
  const [newMasterPasswordInput, setNewMasterPasswordInput] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);

  // ---------------------------------------------------------------------------
  // Check if first-run registration is active
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function checkRegistration() {
      try {
        const res = await fetch("/api/auth/registration-status");
        if (res.ok) {
          const data = await res.json();
          setIsFirstRun(!!data.registrationAllowed);
        }
      } catch (err) {
        console.error("Failed to check registration status:", err);
      } finally {
        setCheckingRegistration(false);
      }
    }
    checkRegistration();
  }, []);

  // ---------------------------------------------------------------------------
  // REGISTRATION FLOW (First Run)
  // ---------------------------------------------------------------------------
  const startRegistrationPhase1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim() || !accountPassword.trim() || !masterPassword.trim()) {
      setErrorMsg("All credential fields are required.");
      return;
    }

    if (accountPassword.trim() === masterPassword.trim()) {
      setErrorMsg("Security Invariant Failed: Account Password and Master Password cannot be identical.");
      return;
    }

    if (masterPassword.length < datakeyConfig.security.passwords.minMasterPasswordLength) {
      setErrorMsg(`Master Password must be at least ${datakeyConfig.security.passwords.minMasterPasswordLength} characters.`);
      return;
    }

    // Generate 24-word BIP-39 mnemonic
    const phraseStr = generate24WordMnemonic();
    const words = phraseStr.split(" ");
    setGeneratedPhrase(words);

    // Pick 3 distinct random words to challenge the owner
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * 24);
      if (!indices.includes(idx)) indices.push(idx);
    }
    indices.sort((a, b) => a - b);
    setChallengeIndices(indices);
    setChallengeAnswers({});

    setStep(2);
  };

  const verifyPhraseAndAdvanceToTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // Validate owner input for the 3 challenge words
    for (const idx of challengeIndices) {
      const answer = (challengeAnswers[idx] || "").trim().toLowerCase();
      const expected = generatedPhrase[idx].toLowerCase();
      if (answer !== expected) {
        setErrorMsg(`Word #${idx + 1} does not match. Please verify your saved 24-word phrase.`);
        return;
      }
    }

    setIsProcessing(true);
    setCryptoStatusText("Creating cryptographic vault envelope...");

    try {
      // 1. Sign up owner with Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: accountPassword.trim(),
      });

      if (signUpError || !signUpData.user) {
        throw new Error(signUpError?.message || "User registration failed with Supabase Auth.");
      }

      const newUserId = signUpData.user.id;
      const fullPhrase = generatedPhrase.join(" ");

      // 2. Create Vault Envelope client-side
      const { envelope, rawVek } = await createVaultEnvelope(
        newUserId,
        masterPassword,
        fullPhrase,
        1
      );

      // 3. Upload ONLY the envelope to vault_envelopes
      const { error: envelopeError } = await supabase.from("vault_envelopes").insert({
        user_id: newUserId,
        key_version: envelope.key_version,
        wrapped_vek_pass: envelope.wrapped_vek_pass,
        salt_vault: envelope.salt_vault,
        iv_pass: envelope.iv_pass,
        argon_memory: envelope.argon_memory,
        argon_iterations: envelope.argon_iterations,
        wrapped_vek_recov: envelope.wrapped_vek_recov,
        salt_recov: envelope.salt_recov,
        iv_recov: envelope.iv_recov,
      });

      if (envelopeError) {
        throw new Error(`Failed to store vault envelope: ${envelopeError.message}`);
      }

      // 4. Create default public profile
      const defaultToken = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(36))
        .join("")
        .slice(0, 16);

      await supabase.from("public_profiles").insert({
        user_id: newUserId,
        public_token: defaultToken,
        lost_mode: false,
        owner_name: email.split("@")[0],
        emergency_instructions: "If found, please notify the owner.",
        visibility_settings: {
          owner_name: true,
          masked_phone: false,
          blood_group: false,
          allergies: false,
          medical_notes: false,
        },
      });

      // 5. Enroll native Supabase TOTP MFA factor
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "DataKey Vault",
        friendlyName: "DataKey Authenticator",
      });

      if (enrollError || !enrollData) {
        // Still unlock if MFA enroll failed due to local setup
        unlockWithVek(rawVek);
        router.push("/vault");
        return;
      }

      setTotpEnrollData({
        id: enrollData.id,
        secret: enrollData.totp.secret,
        qr: enrollData.totp.qr_code,
      });

      // Advance to step 3 (TOTP enrollment verification)
      setStep(3);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Registration failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const verifyEnrollmentCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpEnrollData) return;
    setErrorMsg("");
    setIsProcessing(true);

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: totpEnrollData.id });
      if (challenge.error) throw new Error(challenge.error.message);

      const verifyRes = await supabase.auth.mfa.verify({
        factorId: totpEnrollData.id,
        challengeId: challenge.data.id,
        code: totpCode.trim(),
      });

      if (verifyRes.error) {
        throw new Error("Invalid 6-digit verification code. Please check your authenticator.");
      }

      // Re-unwrap VEK with master password and unlock
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired.");

      const { data: envData } = await supabase
        .from("vault_envelopes")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!envData) throw new Error("Vault envelope missing.");

      const vek = await unwrapVekWithWorker(user.id, masterPassword, envData);
      unlockWithVek(vek);
      router.push("/vault");
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "TOTP verification failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // LOGIN FLOW (Existing Owner)
  // ---------------------------------------------------------------------------
  const handleLoginStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim() || !accountPassword.trim()) {
      setErrorMsg("Please enter both email and account password.");
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Real Supabase Auth sign-in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: accountPassword.trim(),
      });

      if (error || !data.user) {
        throw new Error(error?.message || "Invalid account credentials.");
      }

      // Check if MFA TOTP is enrolled
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw new Error(factorsError.message);

      const totpFactor = factorsData.totp.find((f) => f.status === "verified");

      if (totpFactor) {
        // Create TOTP challenge
        const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (challenge.error) throw new Error(challenge.error.message);

        setCurrentFactorId(totpFactor.id);
        setCurrentChallengeId(challenge.data.id);
        setStep(2);
      } else {
        // No TOTP enrolled yet -> advance directly to Step 3
        setStep(3);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Login failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!currentFactorId || !currentChallengeId) {
      setErrorMsg("MFA session missing. Please start login again.");
      setStep(1);
      return;
    }

    if (totpCode.trim().length !== 6) {
      setErrorMsg("Please enter a valid 6-digit TOTP code.");
      return;
    }

    setIsProcessing(true);

    try {
      const verifyRes = await supabase.auth.mfa.verify({
        factorId: currentFactorId,
        challengeId: currentChallengeId,
        code: totpCode.trim(),
      });

      if (verifyRes.error) {
        throw new Error("Invalid TOTP verification code. Please check your authenticator.");
      }

      // Fetch user's envelope
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication failed.");

      const { data: envData, error: envError } = await supabase
        .from("vault_envelopes")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (envError || !envData) {
        throw new Error("Unable to locate vault cryptographic envelope.");
      }

      setCachedEnvelope(envData);
      setStep(3);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "MFA Verification failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (accountPassword.trim() === masterPassword.trim()) {
      setErrorMsg("Security Invariant Failed: Account Password and Master Password cannot be identical.");
      return;
    }

    setIsProcessing(true);
    setCryptoStatusText("Deriving KEK_pass via Argon2id (64 MiB Wasm)...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired.");

      let envelope = cachedEnvelope;
      if (!envelope) {
        const { data: envData } = await supabase
          .from("vault_envelopes")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (!envData) throw new Error("Vault envelope missing.");
        envelope = envData;
      }

      if (!envelope) {
        throw new Error("Vault envelope missing.");
      }

      // Execute Argon2id & unwrapping in Web Worker
      const vek = await unwrapVekWithWorker(
        user.id,
        masterPassword,
        envelope,
        (status) => setCryptoStatusText(status)
      );

      unlockWithVek(vek);
      router.push("/vault");
    } catch {
      setErrorMsg("Decryption failed: Incorrect master password or corrupted envelope.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 24-Word Recovery Flow
  // ---------------------------------------------------------------------------
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const phrase = recoveryPhraseInput.trim().toLowerCase();
    if (!isValidMnemonic(phrase)) {
      setErrorMsg("Invalid BIP-39 recovery phrase checksum or wordlist. Please verify the 24 words.");
      return;
    }

    if (newMasterPasswordInput.length < datakeyConfig.security.passwords.minMasterPasswordLength) {
      setErrorMsg(`New Master Password must be at least ${datakeyConfig.security.passwords.minMasterPasswordLength} characters.`);
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Please log in with your account credentials before performing vault key recovery.");
      }

      const { data: envelope, error: envErr } = await supabase
        .from("vault_envelopes")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (envErr || !envelope) {
        throw new Error("Vault envelope missing.");
      }

      // Unwrap VEK using KEK_recov derived from BIP-39 mnemonic
      const vek = await unwrapVekWithRecoveryPhrase(user.id, phrase, envelope);

      // Rewrap VEK with new Master Password (zero re-encryption of records needed!)
      const rewrapped = await rewrapVekWithNewPassword(
        user.id,
        newMasterPasswordInput,
        vek,
        envelope.key_version
      );

      // Update envelope in Supabase
      const { error: updateError } = await supabase
        .from("vault_envelopes")
        .update({
          wrapped_vek_pass: rewrapped.wrapped_vek_pass,
          salt_vault: rewrapped.salt_vault,
          iv_pass: rewrapped.iv_pass,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        throw new Error(`Failed to update vault envelope: ${updateError.message}`);
      }

      setRecoverySuccess(true);
      setTimeout(() => {
        unlockWithVek(vek);
        setShowRecoveryModal(false);
        router.push("/vault");
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Recovery unwrapping failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMsg("Please enter your account email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      setErrorMsg(`Password reset failed: ${error.message}`);
    } else {
      setInfoMsg(
        "Password reset email sent. NOTE: Account password reset restores account login only and NEVER decrypts your vault."
      );
    }
  };

  if (checkingRegistration) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[#cdcbca]/50" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      {/* Return to Public Scan Page */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-[#cdcbca]/60 hover:text-[#cdcbca] transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Return to Public Scan Page</span>
      </Link>

      <div className="glass-panel rounded-3xl p-6 sm:p-8">
        {/* Header (Obsidian & Chrome Silver) */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
            <Lock className="h-6 w-6 text-[#cdcbca]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#cdcbca]">
            {isFirstRun ? "DataKey Setup" : "DataKey Vault"}
          </h1>
          <p className="text-xs text-[#cdcbca]/80 font-medium mt-0.5">
            {isFirstRun ? "Initial First-Run Vault Provisioning" : "Owner Authentication"}
          </p>
          <p className="text-[11px] text-[#cdcbca]/50 mt-1">Zero-Knowledge AES-256-GCM Architecture</p>
        </div>

        {/* Step Progression Bar */}
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step >= 1 ? "border border-[#cdcbca] bg-[#cdcbca]/20 text-[#cdcbca]" : "border border-[#cdcbca]/20 text-[#cdcbca]/40"
              }`}
            >
              1
            </span>
            <span className="text-[11px] text-[#cdcbca]/80">
              {isFirstRun ? "Credentials" : "Account"}
            </span>
          </div>
          <div className="h-[1px] w-8 bg-[#cdcbca]/20" />
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step >= 2 ? "border border-[#cdcbca] bg-[#cdcbca]/20 text-[#cdcbca]" : "border border-[#cdcbca]/20 text-[#cdcbca]/40"
              }`}
            >
              2
            </span>
            <span className="text-[11px] text-[#cdcbca]/80">
              {isFirstRun ? "Phrase" : "TOTP 2FA"}
            </span>
          </div>
          <div className="h-[1px] w-8 bg-[#cdcbca]/20" />
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                step >= 3 ? "border border-[#cdcbca] bg-[#cdcbca]/20 text-[#cdcbca]" : "border border-[#cdcbca]/20 text-[#cdcbca]/40"
              }`}
            >
              3
            </span>
            <span className="text-[11px] text-[#cdcbca]/80">
              {isFirstRun ? "Enroll 2FA" : "Vault Key"}
            </span>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="glass-state-error mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs text-[#cdcbca] leading-relaxed">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#cdcbca]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="glass-state-warning mb-4 flex items-start gap-2.5 rounded-xl p-3 text-xs text-[#cdcbca] leading-relaxed">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#cdcbca]" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* -------------------------------------------------------------------
            FIRST RUN: REGISTRATION STEPS
        -------------------------------------------------------------------- */}
        {isFirstRun && step === 1 && (
          <form onSubmit={startRegistrationPhase1} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">Owner Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
                placeholder="owner@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">Account Password</label>
              <div className="relative">
                <input
                  type={showAccountPass ? "text" : "password"}
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  required
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono"
                  placeholder="Min 12 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowAccountPass(!showAccountPass)}
                  className="absolute right-3 top-2.5 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showAccountPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">
                Master Vault Password (Zero-Knowledge)
              </label>
              <div className="relative">
                <input
                  type={showMasterPass ? "text" : "password"}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  required
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono"
                  placeholder="Min 14 characters (never equal to account password)"
                />
                <button
                  type="button"
                  onClick={() => setShowMasterPass(!showMasterPass)}
                  className="absolute right-3 top-2.5 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showMasterPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-[#cdcbca]/50">
                This password encrypts your root VEK. It is never sent to any server.
              </p>
            </div>

            <button
              type="submit"
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <span>Continue to 24-Word Recovery Phrase</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {isFirstRun && step === 2 && (
          <form onSubmit={verifyPhraseAndAdvanceToTotp} className="space-y-4">
            <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#cdcbca]">BIP-39 24-Word Recovery Phrase</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedPhrase.join(" "));
                    setPhraseCopied(true);
                    setTimeout(() => setPhraseCopied(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-[#cdcbca]/70 hover:text-[#cdcbca]"
                >
                  {phraseCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{phraseCopied ? "Copied" : "Copy Words"}</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] text-[#cdcbca]/90 max-h-40 overflow-y-auto p-1">
                {generatedPhrase.map((word, i) => (
                  <div key={i} className="rounded bg-[#080808]/60 px-1.5 py-0.5 border border-[#cdcbca]/10">
                    <span className="text-[#cdcbca]/40 mr-1">{i + 1}.</span>
                    {word}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#cdcbca]/60">
                Store these 24 words securely offline. They are the only way to recover your vault if you lose your master password.
              </p>
            </div>

            {/* Confirm You Saved It: Challenge 3 random words */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#cdcbca]/90">
                Confirm You Saved It (Enter the requested words):
              </label>
              {challengeIndices.map((idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#cdcbca]/70 w-16">Word #{idx + 1}:</span>
                  <input
                    type="text"
                    required
                    value={challengeAnswers[idx] || ""}
                    onChange={(e) =>
                      setChallengeAnswers({ ...challengeAnswers, [idx]: e.target.value })
                    }
                    className="glass-input flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    placeholder={`Type word #${idx + 1}`}
                  />
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>{cryptoStatusText}</span>
                </>
              ) : (
                <>
                  <span>Verify Words & Create Vault Envelope</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {isFirstRun && step === 3 && totpEnrollData && (
          <form onSubmit={verifyEnrollmentCode} className="space-y-4">
            <div className="text-center">
              <Shield className="mx-auto h-8 w-8 text-[#cdcbca] mb-2" />
              <p className="text-xs font-semibold text-[#cdcbca]">Setup Two-Factor Authentication</p>
              <p className="text-[11px] text-[#cdcbca]/60 mt-1">
                Scan this QR code with Google Authenticator, Aegis, or 1Password.
              </p>
            </div>

            <div className="mx-auto flex justify-center rounded-xl bg-white p-3 w-48 h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={totpEnrollData.qr} alt="TOTP QR Code" className="w-full h-full" />
            </div>

            <div className="rounded-lg border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-2 text-center font-mono text-xs text-[#cdcbca]/80">
              Manual Secret: {totpEnrollData.secret}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1 text-center">
                Enter 6-Digit Code to Verify
              </label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                required
                className="glass-input w-full rounded-xl py-2.5 text-center text-xl font-mono tracking-widest text-[#cdcbca]"
                placeholder="000000"
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
                  <span>Enrolling 2FA...</span>
                </>
              ) : (
                <>
                  <span>Activate 2FA & Unlock Vault</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* -------------------------------------------------------------------
            EXISTING OWNER: 3-STEP LOGIN
        -------------------------------------------------------------------- */}
        {!isFirstRun && step === 1 && (
          <form onSubmit={handleLoginStep1} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1.5">Owner Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
                placeholder="owner@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#cdcbca]/80">Account Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[11px] text-[#cdcbca]/70 hover:text-[#cdcbca] underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showAccountPass ? "text" : "password"}
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                  required
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowAccountPass(!showAccountPass)}
                  className="absolute right-3 top-2.5 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showAccountPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                  <span>Verifying Account...</span>
                </>
              ) : (
                <>
                  <span>Continue to 2FA Verification</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {!isFirstRun && step === 2 && (
          <form onSubmit={handleLoginStep2} className="space-y-4">
            <div className="text-center mb-2">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
                <Shield className="h-5 w-5 text-[#cdcbca]" />
              </div>
              <p className="text-xs text-[#cdcbca]">Enter the 6-digit code from your Authenticator app (AAL2).</p>
            </div>

            <div>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                required
                className="glass-input w-full rounded-xl py-3 text-center text-xl font-mono tracking-widest text-[#cdcbca]"
                placeholder="000000"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="glass-button-secondary flex-1 rounded-xl py-2.5 text-xs"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="glass-button-primary flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {isProcessing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Verify Code</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {!isFirstRun && step === 3 && (
          <form onSubmit={handleLoginStep3} className="space-y-4">
            <div className="text-center mb-2">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
                <KeyRound className="h-5 w-5 text-[#cdcbca]" />
              </div>
              <p className="text-xs text-[#cdcbca]">
                Enter your Master Password to derive KEK_pass and unwrap the root VEK.
              </p>
            </div>

            <div>
              <div className="relative">
                <input
                  type={showMasterPass ? "text" : "password"}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  required
                  className="glass-input w-full rounded-xl px-3.5 py-3 pr-10 text-sm font-mono"
                  placeholder="Master Password (min 14 chars)"
                />
                <button
                  type="button"
                  onClick={() => setShowMasterPass(!showMasterPass)}
                  className="absolute right-3 top-3 text-[#cdcbca]/50 hover:text-[#cdcbca]"
                >
                  {showMasterPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isProcessing && (
              <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-[#cdcbca]">
                  <Cpu className="h-4 w-4 animate-pulse" />
                  <span>{cryptoStatusText}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isProcessing}
              className="glass-button-primary w-full rounded-xl py-3 text-xs font-semibold flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Unwrapping...</span>
                </>
              ) : (
                <>
                  <span>Unwrap & Enter Vault</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setShowRecoveryModal(true)}
                className="text-xs text-[#cdcbca]/70 hover:text-[#cdcbca] underline"
              >
                Forgot Master Password? Use 24-Word Recovery Phrase
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 24-Word Recovery Modal */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-[#cdcbca]/30">
            <h2 className="text-base font-bold text-[#cdcbca] mb-1">Vault Key Recovery</h2>
            <p className="text-xs text-[#cdcbca]/70 mb-4">
              Enter your 24-word BIP-39 recovery phrase and set a new Master Password.
            </p>

            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  24-Word Recovery Phrase
                </label>
                <textarea
                  rows={3}
                  value={recoveryPhraseInput}
                  onChange={(e) => setRecoveryPhraseInput(e.target.value)}
                  required
                  placeholder="abandon abandon abandon ... (24 words separated by spaces)"
                  className="glass-input w-full rounded-xl p-3 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cdcbca]/80 mb-1">
                  New Master Password (Min 14 chars)
                </label>
                <input
                  type="password"
                  value={newMasterPasswordInput}
                  onChange={(e) => setNewMasterPasswordInput(e.target.value)}
                  required
                  placeholder="New strong master password"
                  className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm font-mono"
                />
              </div>

              {recoverySuccess && (
                <div className="glass-state-success rounded-xl p-3 text-xs text-[#cdcbca] flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>VEK successfully recovered and re-wrapped! Unlocking vault...</span>
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
                  {isProcessing ? "Recovering..." : "Recover Vault"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
