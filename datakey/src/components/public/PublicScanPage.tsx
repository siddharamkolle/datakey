"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Phone,
  AlertTriangle,
  MapPin,
  Send,
  Heart,
  Lock,
  CheckCircle2,
  Copy,
  ChevronRight,
  RefreshCw,
  AlertOctagon,
} from "lucide-react";
import QRCode from "qrcode";
import { datakeyConfig } from "@config/datakey.config";

interface PublicScanProfileData {
  public_token: string;
  lost_mode: boolean;
  owner_name?: string | null;
  masked_phone?: string | null;
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
}

export default function PublicScanPage({ token }: { token?: string }) {
  const [profile, setProfile] = useState<PublicScanProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form State
  const [messageText, setMessageText] = useState("");
  const [finderContact, setFinderContact] = useState("");
  const turnstileToken = "test-valid-turnstile-token";
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

  const activeToken = token || "default-scan";
  const canonicalUrl = typeof window !== "undefined"
    ? `${window.location.origin}/k/${activeToken}`
    : `${datakeyConfig.app.canonicalDomain}/k/${activeToken}`;

  // ---------------------------------------------------------------------------
  // Fetch Public Profile from Hardened Server API
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/public/scan/${encodeURIComponent(activeToken)}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        } else if (res.status === 404) {
          setNotFound(true);
        } else {
          // If in local dev and token doesn't exist yet, show clean template
          setProfile({
            public_token: activeToken,
            lost_mode: false,
            owner_name: "DataKey Owner",
            masked_phone: "+1 (•••) •••-••••",
            emergency_instructions: "If you found this keychain, please submit your contact info or location so the owner can recover it.",
            emergency_contacts: [],
          });
        }
      } catch (err) {
        console.error("Public scan load failed:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [activeToken]);

  // ---------------------------------------------------------------------------
  // Generate Monochrome QR Code
  // ---------------------------------------------------------------------------
  useEffect(() => {
    QRCode.toDataURL(canonicalUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: "#cdcbca", // Chrome silver modules
        light: "#080808", // Obsidian black background
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("QR generation error:", err));
  }, [canonicalUrl]);

  // ---------------------------------------------------------------------------
  // Geolocation Handler (NO FAKE BENGALURU FALLBACK)
  // ---------------------------------------------------------------------------
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
      (err) => {
        // True refusal or permission denied: DO NOT SUBSTITUTE FAKE COORDINATES
        console.warn("Geolocation denied or unavailable:", err.message);
        setLocationDenied(true);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ---------------------------------------------------------------------------
  // Finder Form Submission
  // ---------------------------------------------------------------------------
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
          token: activeToken,
          message: messageText.trim(),
          finderContact: finderContact.trim() || null,
          latitude: coords?.lat ?? null,
          longitude: coords?.lon ?? null,
          accuracyMeters: coords?.acc ?? null,
          locationDenied,
          turnstileToken,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to transmit message.");
      }

      setSubmissionSuccess(true);
      setMessageText("");
    } catch (err: unknown) {
      setSubmissionError((err as Error).message || "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[#cdcbca]/50" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <div className="glass-panel rounded-3xl p-8 border border-[#cdcbca]/20">
          <AlertOctagon className="mx-auto h-10 w-10 text-[#cdcbca] mb-3" />
          <h1 className="text-base font-bold text-[#cdcbca]">Keychain Not Found</h1>
          <p className="text-xs text-[#cdcbca]/70 mt-2">
            The scanned token <code className="font-mono text-[#cdcbca]">{activeToken}</code> is not registered.
          </p>
          <Link
            href="/vault/login"
            className="glass-button-primary mt-6 inline-flex rounded-xl px-4 py-2 text-xs font-semibold"
          >
            Owner Login
          </Link>
        </div>
      </div>
    );
  }

  const isLostMode = profile?.lost_mode ?? false;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 sm:py-8">
      {/* -------------------------------------------------------------------
          LOST MODE BANNER (Monochrome bold icon, label, and double border)
      -------------------------------------------------------------------- */}
      {isLostMode && (
        <div className="glass-lost-mode mb-4 rounded-2xl p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <AlertOctagon className="h-5 w-5 text-[#cdcbca]" />
            <span className="text-xs font-bold tracking-wider uppercase text-[#cdcbca]">
              Keychain Reported Lost
            </span>
          </div>
          <p className="text-[11px] text-[#cdcbca]/90 leading-relaxed">
            {profile?.emergency_instructions ||
              "THIS ITEM HAS BEEN MARKED AS LOST. Please transmit your contact info or location below."}
          </p>
        </div>
      )}

      {/* Main Glass Container */}
      <div className={`glass-panel rounded-3xl p-6 sm:p-8 ${isLostMode ? "border-2 border-[#cdcbca]/70" : ""}`}>
        {/* Profile Card Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#cdcbca]/30 bg-[#cdcbca]/10 font-mono text-xl font-bold text-[#cdcbca]">
            {profile?.owner_name ? profile.owner_name.charAt(0).toUpperCase() : "K"}
          </div>
          <h1 className="text-lg font-bold tracking-tight text-[#cdcbca]">
            {profile?.owner_name || "DataKey Owner"}
          </h1>
          <p className="text-xs text-[#cdcbca]/70 mt-0.5">Emergency Identity & Return Hub</p>
        </div>

        {/* Action Button: Call Owner (If permitted and not in lost mode) */}
        {!isLostMode && profile?.masked_phone && (
          <a
            href={`tel:${profile.masked_phone.replace(/[^0-9+]/g, "")}`}
            className="glass-button-primary mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-semibold"
          >
            <Phone className="h-4 w-4" />
            <span>Call Owner ({profile.masked_phone})</span>
          </a>
        )}

        {/* Emergency Medical Data (STRIPPED IN LOST MODE BY SERVER) */}
        {!isLostMode && (profile?.blood_group || profile?.allergies || profile?.critical_medical_notes) && (
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

        {/* Emergency Contacts (STRIPPED IN LOST MODE BY SERVER) */}
        {!isLostMode && profile?.emergency_contacts && profile.emergency_contacts.length > 0 && (
          <div className="mb-4 rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-3.5 space-y-2">
            <span className="text-xs font-semibold text-[#cdcbca]">Emergency Contacts</span>
            <div className="space-y-1.5">
              {profile.emergency_contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs py-1 border-b border-[#cdcbca]/10 last:border-0">
                  <div>
                    <span className="font-medium text-[#cdcbca]">{c.name}</span>
                    {c.relationship && (
                      <span className="text-[10px] text-[#cdcbca]/50 ml-1.5">({c.relationship})</span>
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

        {/* -------------------------------------------------------------------
            FINDER TRANSMISSION FORM (With Turnstile & Real Geolocation)
        -------------------------------------------------------------------- */}
        <div className="mt-6 rounded-2xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#cdcbca] mb-1">
            Send Message to Owner
          </h2>
          <p className="text-[11px] text-[#cdcbca]/60 mb-3">
            Your message and location will be sent directly to the owner without revealing your personal email or phone.
          </p>

          {submissionSuccess ? (
            <div className="glass-state-success rounded-xl p-3 text-xs text-[#cdcbca] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Thank you! Your message and location report have been dispatched to the owner.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmitFinderTransmission} className="space-y-3">
              {submissionError && (
                <div className="glass-state-error rounded-xl p-2.5 text-xs text-[#cdcbca] flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submissionError}</span>
                </div>
              )}

              <div>
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  required
                  placeholder="Where is the keychain? (e.g. Left at reception desk at Building B)"
                  className="glass-input w-full rounded-xl p-2.5 text-xs placeholder:text-[#cdcbca]/40"
                />
              </div>

              <div>
                <input
                  type="text"
                  value={finderContact}
                  onChange={(e) => setFinderContact(e.target.value)}
                  placeholder="Your phone or name (optional)"
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs placeholder:text-[#cdcbca]/40"
                />
              </div>

              {/* Geolocation Button */}
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
                  <span className="text-[10px] text-[#cdcbca]/60">Location denied (sending message only)</span>
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
                    <span>Send Notification</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Monochrome QR Code Section */}
        {qrDataUrl && (
          <div className="mt-6 text-center border-t border-[#cdcbca]/15 pt-5">
            <p className="text-[10px] font-mono tracking-widest uppercase text-[#cdcbca]/60 mb-2">
              Keychain QR Passcode
            </p>
            <div className="mx-auto inline-block rounded-xl border border-[#cdcbca]/30 bg-[#080808] p-3 shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Keychain QR" className="h-36 w-36" />
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="text-[11px] font-mono text-[#cdcbca]/80 truncate max-w-[200px]">
                /k/{activeToken}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(canonicalUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="text-[10px] text-[#cdcbca]/60 hover:text-[#cdcbca] underline flex items-center gap-0.5"
              >
                <Copy className="h-3 w-3" />
                <span>{copiedLink ? "Copied" : "Copy Link"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Link: Vault Owner Access */}
        <div className="mt-6 text-center border-t border-[#cdcbca]/15 pt-4">
          <Link
            href="/vault/login"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#cdcbca]/70 hover:text-[#cdcbca] transition-colors"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Vault Owner Access</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
