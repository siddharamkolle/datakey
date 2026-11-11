"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  AlertTriangle,
  MapPin,
  Send,
  Heart,
  Lock,
  Unlock,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertOctagon,
  ExternalLink,
  Shield,
  Download,
  Globe,
} from "lucide-react";
import QRCode from "qrcode";
import { datakeyConfig } from "@config/datakey.config";
import { useVault } from "@/lib/vault/vaultContext";

interface PublicScanProfileData {
  public_token: string;
  lost_mode: boolean;
  lost_banner_title?: string;
  owner_name?: string | null;
  tagline?: string | null;
  bio?: string | null;
  location_label?: string | null;
  avatar_url?: string | null;
  masked_phone?: string | null;
  public_email?: string | null;
  custom_links?: Array<{
    id: string;
    label: string;
    url: string;
    is_visible: boolean;
  }>;
  emergency_instructions?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  critical_medical_notes?: string | null;
  emergency_contacts?: Array<{
    id: string;
    name: string;
    relationship?: string;
    phone: string;
    priority: number;
  }>;
  show_avatar?: boolean;
  show_message_form?: boolean;
  show_qr_code?: boolean;
}

function isSafeHref(rawUrl: string): boolean {
  const trimmed = rawUrl.trim().toLowerCase();
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  );
}

export default function PublicScanPage({ token }: { token?: string }) {
  const { isVaultUnlocked } = useVault();

  const [profile, setProfile] = useState<PublicScanProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Message Form State
  const [messageText, setMessageText] = useState("");
  const [finderContact, setFinderContact] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  // Location State
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsShared, setGpsShared] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number; acc?: number } | null>(null);

  // QR Code
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchToken = token || "default";
  const displayToken = profile?.public_token || token || "owner";
  const canonicalUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/k/${displayToken}`
      : `${datakeyConfig.app.canonicalDomain}/k/${displayToken}`;

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(`/api/public/scan/${encodeURIComponent(fetchToken)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 404) {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Public view load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchProfile();
  }, [fetchToken]);

  useEffect(() => {
    if (!profile) return;
    QRCode.toDataURL(canonicalUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#cdcbca",
        light: "#080808",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR generation error:", err));
  }, [canonicalUrl, profile]);

  const handleRequestLocation = () => {
    setGpsLoading(true);
    setLocationDenied(false);

    if (!navigator.geolocation) {
      setLocationDenied(true);
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy,
        });
        setGpsShared(true);
        setGpsLoading(false);
      },
      () => {
        setLocationDenied(true);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmitFinderTransmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setIsSubmitting(true);
    setSubmissionError("");

    try {
      const res = await fetch("/api/finder/transmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: displayToken,
          message: messageText.trim(),
          finderContact: finderContact.trim() || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lon ?? null,
          accuracyMeters: coords?.acc ?? null,
          locationDenied,
          turnstileToken: "local-bypass",
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to send message.");
      }

      setSubmissionSuccess(true);
      setMessageText("");
      setFinderContact("");
    } catch (err: unknown) {
      setSubmissionError((err as Error).message || "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Top Header Bar (Always shown so Master Login is clearly accessible)
  const topBar = (
    <header className="mb-5 flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
          <Shield className="h-4 w-4 text-[#cdcbca]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-tight text-[#cdcbca]">DataKey</span>
            {profile?.lost_mode ? (
              <span className="rounded border border-[#cdcbca]/60 bg-[#cdcbca]/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#cdcbca]">
                Lost Mode
              </span>
            ) : (
              <span className="rounded border border-[#cdcbca]/20 bg-[#cdcbca]/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#cdcbca]/70 flex items-center gap-1">
                <Globe className="h-2.5 w-2.5" />
                Public View
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#cdcbca]/55">Personal Public Card</p>
        </div>
      </div>

      <Link
        href={isVaultUnlocked ? "/vault" : "/vault/login"}
        className="glass-button-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
      >
        {isVaultUnlocked ? (
          <>
            <Unlock className="h-3.5 w-3.5" />
            <span>Open Vault</span>
          </>
        ) : (
          <>
            <Lock className="h-3.5 w-3.5" />
            <span>Master Login</span>
          </>
        )}
      </Link>
    </header>
  );

  if (loading) {
    return (
      <div className="flex w-full flex-col items-center">
        {topBar}
        <div className="flex min-h-[45vh] items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-[#cdcbca]/50" />
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex w-full flex-col items-center">
        {topBar}
        <div className="w-full max-w-lg text-center">
          <div className="glass-panel rounded-3xl p-8 border border-[#cdcbca]/20">
            <AlertOctagon className="mx-auto h-10 w-10 text-[#cdcbca] mb-3" />
            <h1 className="text-base font-bold text-[#cdcbca]">Public Page Not Found</h1>
            <p className="text-xs text-[#cdcbca]/70 mt-2">
              The link token <code className="font-mono text-[#cdcbca]">{fetchToken}</code> does not match the active profile.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link href="/" className="glass-button-secondary rounded-xl px-4 py-2 text-xs font-semibold">
                Go to Home
              </Link>
              <Link href="/vault/login" className="glass-button-primary rounded-xl px-4 py-2 text-xs font-semibold">
                Master Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLostMode = profile.lost_mode;
  const hasMedicalData =
    !isLostMode &&
    Boolean(profile.blood_group || profile.allergies || profile.critical_medical_notes);

  return (
    <div className="flex w-full flex-col items-center pb-8">
      {topBar}

      <div className="w-full max-w-lg">
        {/* LOST MODE BANNER */}
        {isLostMode && (
          <div className="glass-lost-mode mb-4 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <AlertOctagon className="h-5 w-5 text-[#cdcbca]" />
              <span className="text-xs font-bold tracking-wider uppercase text-[#cdcbca]">
                {profile.lost_banner_title || "Keychain Reported Lost"}
              </span>
            </div>
            <p className="text-[11px] text-[#cdcbca]/90 leading-relaxed">
              {profile.emergency_instructions ||
                "THIS ITEM HAS BEEN MARKED AS LOST. Please transmit your contact info or location below."}
            </p>
          </div>
        )}

        {/* MAIN PUBLIC VIEW GLASS CARD */}
        <div
          className={`glass-panel rounded-3xl p-6 sm:p-8 ${
            isLostMode ? "border-2 border-[#cdcbca]/70" : ""
          }`}
        >
          {/* Profile Identity Header */}
          <div className="text-center mb-6">
            {(profile.show_avatar ?? true) && (
              profile.avatar_url && isSafeHref(profile.avatar_url) ? (
                <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-2xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile.avatar_url}
                    alt={profile.owner_name || "Owner"}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#cdcbca]/30 bg-[#cdcbca]/10 font-mono text-2xl font-bold text-[#cdcbca]">
                  {(profile.owner_name || "D").charAt(0).toUpperCase()}
                </div>
              )
            )}

            {profile.owner_name && (
              <h1 className="text-xl font-bold tracking-tight text-[#cdcbca]">
                {profile.owner_name}
              </h1>
            )}

            {!isLostMode && profile.tagline && (
              <p className="text-xs text-[#cdcbca]/75 mt-1">{profile.tagline}</p>
            )}

            {!isLostMode && profile.location_label && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#cdcbca]/15 bg-[#cdcbca]/5 px-2.5 py-0.5 text-[11px] text-[#cdcbca]/70">
                <MapPin className="h-3 w-3" />
                <span>{profile.location_label}</span>
              </div>
            )}

            {!isLostMode && profile.bio && (
              <p className="mt-3 text-xs text-[#cdcbca]/80 leading-relaxed whitespace-pre-line">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Direct Contact Actions */}
          {!isLostMode && (profile.masked_phone || profile.public_email) && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {profile.masked_phone && (
                <a
                  href={`tel:${profile.masked_phone.replace(/[^0-9+]/g, "")}`}
                  className="glass-button-primary flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span className="truncate">Call ({profile.masked_phone})</span>
                </a>
              )}
              {profile.public_email && (
                <a
                  href={`mailto:${profile.public_email}`}
                  className="glass-button-secondary flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{profile.public_email}</span>
                </a>
              )}
            </div>
          )}

          {/* Custom Personal Links */}
          {!isLostMode && profile.custom_links && profile.custom_links.length > 0 && (
            <div className="mb-4 space-y-2">
              {profile.custom_links
                .filter((l) => isSafeHref(l.url))
                .map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-button-secondary flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-xs font-medium"
                  >
                    <span className="text-[#cdcbca]">{link.label || link.url}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-[#cdcbca]/60" />
                  </a>
                ))}
            </div>
          )}

          {/* Emergency Medical Advisory */}
          {hasMedicalData && (
            <div className="mb-4 rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#cdcbca]">
                <Heart className="h-4 w-4" />
                <span>Medical & Health Advisory</span>
              </div>
              {profile.blood_group && (
                <div className="text-[11px] text-[#cdcbca]/90">
                  <span className="text-[#cdcbca]/50 font-mono">Blood Group: </span>
                  {profile.blood_group}
                </div>
              )}
              {profile.allergies && (
                <div className="text-[11px] text-[#cdcbca]/90">
                  <span className="text-[#cdcbca]/50 font-mono">Allergies: </span>
                  {profile.allergies}
                </div>
              )}
              {profile.critical_medical_notes && (
                <div className="text-[11px] text-[#cdcbca]/90">
                  <span className="text-[#cdcbca]/50 font-mono">Notes: </span>
                  {profile.critical_medical_notes}
                </div>
              )}
            </div>
          )}

          {/* Emergency Contacts */}
          {!isLostMode &&
            profile.emergency_contacts &&
            profile.emergency_contacts.length > 0 && (
              <div className="mb-4 rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3.5 space-y-2">
                <span className="text-xs font-semibold text-[#cdcbca]">Emergency Contacts</span>
                <div className="space-y-1.5">
                  {profile.emergency_contacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between text-xs py-1 border-b border-[#cdcbca]/10 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-[#cdcbca]">{c.name}</span>
                        {c.relationship && (
                          <span className="text-[10px] text-[#cdcbca]/50 ml-1.5">
                            ({c.relationship})
                          </span>
                        )}
                      </div>
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-1 text-[11px] text-[#cdcbca]/80 underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span>Call</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Message / Finder Form */}
          {(profile.show_message_form ?? true) && (
            <div className="mt-5 rounded-2xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#cdcbca] mb-1">
                Send Message to Owner
              </h2>
              <p className="text-[11px] text-[#cdcbca]/60 mb-3">
                {!isLostMode && profile.emergency_instructions
                  ? profile.emergency_instructions
                  : "Your message and optional location are sent directly to the owner's private vault."}
              </p>

              {submissionSuccess ? (
                <div className="space-y-2">
                  <div className="glass-state-success rounded-xl p-3 text-xs text-[#cdcbca] flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Message delivered safely to the owner.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmissionSuccess(false)}
                    className="glass-button-secondary w-full rounded-xl py-2 text-[11px]"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitFinderTransmission} className="space-y-3">
                  {submissionError && (
                    <div className="glass-state-error rounded-xl p-2.5 text-xs text-[#cdcbca] flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{submissionError}</span>
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    required
                    placeholder="Write a message (e.g. Found your keychain or reaching out...)"
                    className="glass-input w-full rounded-xl p-2.5 text-xs placeholder:text-[#cdcbca]/40"
                  />

                  <input
                    type="text"
                    value={finderContact}
                    onChange={(e) => setFinderContact(e.target.value)}
                    placeholder="Your name, phone, or email (optional)"
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs placeholder:text-[#cdcbca]/40"
                  />

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={handleRequestLocation}
                      disabled={gpsLoading || gpsShared}
                      className="glass-button-secondary rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      <span>
                        {gpsLoading
                          ? "Acquiring GPS..."
                          : gpsShared
                          ? "Location Attached ✓"
                          : "Attach My Location"}
                      </span>
                    </button>

                    {locationDenied && (
                      <span className="text-[10px] text-[#cdcbca]/60">
                        Location skipped (message only)
                      </span>
                    )}
                    {gpsShared && coords && (
                      <span className="text-[10px] text-[#cdcbca]/70 font-mono">
                        ~{Math.round(coords.acc || 0)}m accuracy
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="glass-button-primary w-full rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 mt-2"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Monochrome QR Code Section */}
          {(profile.show_qr_code ?? true) && qrDataUrl && (
            <div className="mt-6 text-center border-t border-[#cdcbca]/15 pt-5">
              <p className="text-[10px] font-mono tracking-widest uppercase text-[#cdcbca]/60 mb-2">
                Public Page QR Code
              </p>
              <div className="mx-auto inline-block rounded-xl border border-[#cdcbca]/30 bg-[#080808] p-3 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="DataKey Public QR" className="h-36 w-36" />
              </div>
              <div className="mt-2.5 flex items-center justify-center gap-3">
                <span className="text-[11px] font-mono text-[#cdcbca]/80 truncate max-w-[180px]">
                  /k/{displayToken}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(canonicalUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="text-[10px] text-[#cdcbca]/70 hover:text-[#cdcbca] underline flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                </button>
                <a
                  href={qrDataUrl}
                  download={`datakey-qr-${displayToken}.png`}
                  className="text-[10px] text-[#cdcbca]/70 hover:text-[#cdcbca] underline flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Save QR</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
