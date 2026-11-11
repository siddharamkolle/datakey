"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  User,
  Link2,
  Heart,
  Users,
  Sliders,
  Eye,
  EyeOff,
} from "lucide-react";
import type {
  PublicEmergencyProfile,
  PublicCustomLink,
  EmergencyContact,
} from "@/lib/vault/vaultState";

interface PublicViewEditorProps {
  profile: PublicEmergencyProfile;
  onSave: (updated: PublicEmergencyProfile) => Promise<void>;
}

export default function PublicViewEditor({ profile, onSave }: PublicViewEditorProps) {
  const [draft, setDraft] = useState<PublicEmergencyProfile | null>(null);
  const form = draft ?? profile;
  const setForm = (
    updater:
      | PublicEmergencyProfile
      | ((prev: PublicEmergencyProfile) => PublicEmergencyProfile)
  ) => {
    setDraft((prev) =>
      typeof updater === "function" ? updater(prev ?? profile) : updater
    );
  };

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Add Custom Link state
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Add Emergency Contact state
  const [newContactName, setNewContactName] = useState("");
  const [newContactRelation, setNewContactRelation] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg("");
    setErrorMsg("");
    try {
      await onSave(form);
      setDraft(null);
      setStatusMsg("Public View updated & saved to database.");
      setTimeout(() => setStatusMsg(""), 3500);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || "Failed to save Public View.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    let cleanUrl = newLinkUrl.trim();
    if (
      !cleanUrl.startsWith("https://") &&
      !cleanUrl.startsWith("http://") &&
      !cleanUrl.startsWith("mailto:") &&
      !cleanUrl.startsWith("tel:")
    ) {
      cleanUrl = `https://${cleanUrl}`;
    }
    const newItem: PublicCustomLink = {
      id: crypto.randomUUID(),
      label: newLinkLabel.trim() || cleanUrl,
      url: cleanUrl,
      is_visible: true,
    };
    setForm((prev) => ({
      ...prev,
      custom_links: [...(prev.custom_links || []), newItem],
    }));
    setNewLinkLabel("");
    setNewLinkUrl("");
  };

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const newItem: EmergencyContact = {
      id: crypto.randomUUID(),
      name: newContactName.trim(),
      relationship: newContactRelation.trim(),
      phone_number: newContactPhone.trim(),
      priority_order: (form.emergency_contacts?.length || 0) + 1,
      is_visible: true,
    };
    setForm((prev) => ({
      ...prev,
      emergency_contacts: [...(prev.emergency_contacts || []), newItem],
    }));
    setNewContactName("");
    setNewContactRelation("");
    setNewContactPhone("");
  };

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-6">
      {/* Header & Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cdcbca]/15 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cdcbca]/30 bg-[#cdcbca]/10">
            <Globe className="h-4 w-4 text-[#cdcbca]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#cdcbca]">Public View Editor (First Page)</h2>
            <p className="text-xs text-[#cdcbca]/60">
              Customize everything visitors see on the first page (/) and your QR link (/k/{form.public_token || "owner"}).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="glass-button-outline flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>View First Page</span>
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="glass-button-primary flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save Public View"}</span>
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="glass-state-success rounded-xl p-3 text-xs text-[#cdcbca] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="glass-state-error rounded-xl p-3 text-xs text-[#cdcbca]">
          {errorMsg}
        </div>
      )}

      {/* SECTION 1: PERSONAL IDENTITY & BIO */}
      <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#cdcbca]">
          <User className="h-4 w-4" />
          <span>Identity, Bio & Header</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Owner Name / Title</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_owner_name}
                  onChange={(e) => setForm({ ...form, show_owner_name: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              placeholder="Your Name"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Tagline / Subtitle</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_tagline}
                  onChange={(e) => setForm({ ...form, show_tagline: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="e.g. Developer • Personal Identity Hub"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Location / City</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_location}
                  onChange={(e) => setForm({ ...form, show_location: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.location_label}
              onChange={(e) => setForm({ ...form, location_label: e.target.value })}
              placeholder="e.g. Bengaluru, India"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Avatar Image URL (optional)</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_avatar}
                  onChange={(e) => setForm({ ...form, show_avatar: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="url"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              placeholder="https://... (leave blank for initial badge)"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#cdcbca]/80">Personal Bio / About Note</label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_bio}
                onChange={(e) => setForm({ ...form, show_bio: e.target.checked })}
              />
              <span>Show</span>
            </label>
          </div>
          <textarea
            rows={3}
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Write a short bio, introduction, or note visitors see on your first page..."
            className="glass-input w-full rounded-xl p-3 text-xs"
          />
        </div>
      </div>

      {/* SECTION 2: CONTACT BUTTONS & PERSONAL LINKS */}
      <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#cdcbca]">
          <Link2 className="h-4 w-4" />
          <span>Contact Info & Custom Links</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Phone Number (Call Button)</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_owner_phone}
                  onChange={(e) => setForm({ ...form, show_owner_phone: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.masked_owner_phone}
              onChange={(e) => setForm({ ...form, masked_owner_phone: e.target.value })}
              placeholder="+91 98765 43210"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Public Email Button</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_public_email}
                  onChange={(e) => setForm({ ...form, show_public_email: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="email"
              value={form.public_email}
              onChange={(e) => setForm({ ...form, public_email: e.target.value })}
              placeholder="hello@yourdomain.com"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        {/* Custom Links Manager */}
        <div className="pt-2 border-t border-[#cdcbca]/10 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#cdcbca]/90">
              Personal Links / Social Profiles ({form.custom_links?.length || 0})
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_custom_links}
                onChange={(e) => setForm({ ...form, show_custom_links: e.target.checked })}
              />
              <span>Show Links Section</span>
            </label>
          </div>

          {form.custom_links && form.custom_links.length > 0 && (
            <div className="space-y-2">
              {form.custom_links.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cdcbca]/15 bg-[#080808]/60 px-3 py-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[#cdcbca] truncate">{item.label}</div>
                    <div className="text-[11px] font-mono text-[#cdcbca]/55 truncate">{item.url}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          custom_links: prev.custom_links.map((l) =>
                            l.id === item.id ? { ...l, is_visible: !l.is_visible } : l
                          ),
                        }))
                      }
                      className="glass-button-secondary rounded-lg px-2 py-1 text-[11px] flex items-center gap-1"
                    >
                      {item.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      <span>{item.is_visible ? "Visible" : "Hidden"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          custom_links: prev.custom_links.filter((l) => l.id !== item.id),
                        }))
                      }
                      className="glass-button-secondary rounded-lg p-1.5 text-[#cdcbca]/60 hover:text-[#cdcbca]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              value={newLinkLabel}
              onChange={(e) => setNewLinkLabel(e.target.value)}
              placeholder="Label (e.g. GitHub, Portfolio)"
              className="glass-input sm:col-span-4 rounded-xl px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              placeholder="https://github.com/username"
              className="glass-input sm:col-span-6 rounded-xl px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleAddLink}
              className="glass-button-secondary sm:col-span-2 rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: MEDICAL & HEALTH ADVISORY */}
      <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#cdcbca]">
          <Heart className="h-4 w-4" />
          <span>Medical & Health Advisory (Auto-hidden in Lost Mode)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Blood Group</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_blood_group}
                  onChange={(e) => setForm({ ...form, show_blood_group: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.blood_group}
              onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
              placeholder="e.g. O+"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#cdcbca]/80">Allergies</label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_allergies}
                  onChange={(e) => setForm({ ...form, show_allergies: e.target.checked })}
                />
                <span>Show</span>
              </label>
            </div>
            <input
              type="text"
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              placeholder="e.g. Penicillin, Peanuts, or None"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#cdcbca]/80">Critical Medical Notes</label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_medical_notes}
                onChange={(e) => setForm({ ...form, show_medical_notes: e.target.checked })}
              />
              <span>Show</span>
            </label>
          </div>
          <textarea
            rows={2}
            value={form.critical_medical_notes}
            onChange={(e) => setForm({ ...form, critical_medical_notes: e.target.value })}
            placeholder="Important notes for first responders..."
            className="glass-input w-full rounded-xl p-2.5 text-xs"
          />
        </div>
      </div>

      {/* SECTION 4: EMERGENCY CONTACTS */}
      <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#cdcbca]">
            <Users className="h-4 w-4" />
            <span>Emergency Contacts (Auto-hidden in Lost Mode)</span>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-[#cdcbca]/70 cursor-pointer">
            <input
              type="checkbox"
              checked={form.show_emergency_contacts}
              onChange={(e) => setForm({ ...form, show_emergency_contacts: e.target.checked })}
            />
            <span>Show Section</span>
          </label>
        </div>

        {form.emergency_contacts && form.emergency_contacts.length > 0 && (
          <div className="space-y-2">
            {form.emergency_contacts.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cdcbca]/15 bg-[#080808]/60 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#cdcbca]">{c.name}</span>
                  {c.relationship && (
                    <span className="text-[11px] text-[#cdcbca]/55 ml-1.5">({c.relationship})</span>
                  )}
                  <div className="text-[11px] font-mono text-[#cdcbca]/70">{c.phone_number}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        emergency_contacts: prev.emergency_contacts.map((item) =>
                          item.id === c.id ? { ...item, is_visible: !item.is_visible } : item
                        ),
                      }))
                    }
                    className="glass-button-secondary rounded-lg px-2 py-1 text-[11px] flex items-center gap-1"
                  >
                    {c.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    <span>{c.is_visible ? "Visible" : "Hidden"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        emergency_contacts: prev.emergency_contacts.filter((item) => item.id !== c.id),
                      }))
                    }
                    className="glass-button-secondary rounded-lg p-1.5 text-[#cdcbca]/60 hover:text-[#cdcbca]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            placeholder="Contact Name"
            className="glass-input sm:col-span-4 rounded-xl px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={newContactRelation}
            onChange={(e) => setNewContactRelation(e.target.value)}
            placeholder="Relation (e.g. Family)"
            className="glass-input sm:col-span-3 rounded-xl px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={newContactPhone}
            onChange={(e) => setNewContactPhone(e.target.value)}
            placeholder="Phone Number"
            className="glass-input sm:col-span-3 rounded-xl px-3 py-2 text-xs font-mono"
          />
          <button
            type="button"
            onClick={handleAddContact}
            className="glass-button-secondary sm:col-span-2 rounded-xl px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* SECTION 5: PAGE LINK, WIDGETS & INSTRUCTIONS */}
      <div className="rounded-xl border border-[#cdcbca]/20 bg-[#cdcbca]/5 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#cdcbca]">
          <Sliders className="h-4 w-4" />
          <span>Public Page Widgets & Link Settings</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs text-[#cdcbca]/80">Public QR Link Slug (/k/...)</label>
            <input
              type="text"
              value={form.public_token}
              onChange={(e) => setForm({ ...form, public_token: e.target.value })}
              placeholder="owner"
              className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono"
            />
          </div>

          <div className="flex flex-col justify-center gap-2 text-xs pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_message_form}
                onChange={(e) => setForm({ ...form, show_message_form: e.target.checked })}
              />
              <span>Show &quot;Send Message &amp; Location&quot; Form on First Page</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_qr_code}
                onChange={(e) => setForm({ ...form, show_qr_code: e.target.checked })}
              />
              <span>Show QR Code Card on First Page</span>
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-[#cdcbca]/80">
            Message Form Prompt / Return Instructions
          </label>
          <textarea
            rows={2}
            value={form.emergency_instructions}
            onChange={(e) => setForm({ ...form, emergency_instructions: e.target.value })}
            placeholder="Instructions shown above the message box (and in Lost Mode)..."
            className="glass-input w-full rounded-xl p-2.5 text-xs"
          />
        </div>
      </div>

      {/* Bottom Save Button */}
      <div className="flex items-center justify-end gap-3 pt-1">
        {statusMsg && <span className="text-xs text-[#cdcbca]">{statusMsg}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="glass-button-primary flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-semibold"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? "Saving..." : "Save All Public View Changes"}</span>
        </button>
      </div>
    </div>
  );
}
