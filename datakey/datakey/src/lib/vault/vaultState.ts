/**
 * DataKey Vault Type Definitions & State Contracts
 *
 * Plaintext vault secrets remain strictly ephemeral in browser memory and are NEVER written to localStorage.
 */

export interface PublicCustomLink {
  id: string;
  label: string;
  url: string;
  is_visible: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone_number: string;
  priority_order: number;
  is_visible: boolean;
}

export interface PublicVisibilitySettings {
  show_avatar: boolean;
  show_owner_name: boolean;
  show_tagline: boolean;
  show_location: boolean;
  show_bio: boolean;
  show_owner_phone: boolean;
  show_public_email: boolean;
  show_custom_links: boolean;
  show_blood_group: boolean;
  show_allergies: boolean;
  show_medical_notes: boolean;
  show_emergency_contacts: boolean;
  show_message_form: boolean;
  show_qr_code: boolean;
}

export interface PublicEmergencyProfile {
  public_token: string;
  is_lost_mode: boolean;
  lost_banner_title: string;
  owner_name: string;
  tagline: string;
  bio: string;
  location_label: string;
  avatar_url: string;
  masked_owner_phone: string;
  public_email: string;
  blood_group: string;
  allergies: string;
  critical_medical_notes: string;
  emergency_instructions: string;
  custom_links: PublicCustomLink[];
  emergency_contacts: EmergencyContact[];
  // Visibility flags (also exposed individually for convenience)
  show_avatar: boolean;
  show_owner_name: boolean;
  show_tagline: boolean;
  show_location: boolean;
  show_bio: boolean;
  show_owner_phone: boolean;
  show_public_email: boolean;
  show_custom_links: boolean;
  show_blood_group: boolean;
  show_allergies: boolean;
  show_medical_notes: boolean;
  show_emergency_contacts: boolean;
  show_message_form: boolean;
  show_qr_code: boolean;
}

export interface VaultCredential {
  id: string;
  title: string;
  category: "Banking" | "Cloud" | "Email" | "Wi-Fi" | "Social" | "Other";
  username: string;
  password: string;
  url?: string;
  notes?: string;
  folder_id?: string;
  version_counter: number;
  is_deleted: boolean;
  deleted_at?: string;
  updated_at: string;
}

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  folder_id?: string;
  is_pinned: boolean;
  version_counter: number;
  is_deleted: boolean;
  deleted_at?: string;
  updated_at: string;
}

export interface VaultFileMeta {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  folder_id?: string;
  total_chunks: number;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
}

export interface FinderTransmission {
  id: string;
  finder_message: string;
  finder_contact_info?: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters?: number | null;
  location_denied: boolean;
  created_at: string;
}

export interface VaultFolder {
  id: string;
  name: string;
  icon: string;
}

export const DEFAULT_VISIBILITY_SETTINGS: PublicVisibilitySettings = {
  show_avatar: true,
  show_owner_name: true,
  show_tagline: true,
  show_location: true,
  show_bio: true,
  show_owner_phone: true,
  show_public_email: true,
  show_custom_links: true,
  show_blood_group: false,
  show_allergies: false,
  show_medical_notes: false,
  show_emergency_contacts: true,
  show_message_form: true,
  show_qr_code: true,
};

export const DEFAULT_PUBLIC_PROFILE: PublicEmergencyProfile = {
  public_token: "owner",
  is_lost_mode: false,
  lost_banner_title: "Keychain Reported Lost",
  owner_name: "DataKey Owner",
  tagline: "Personal Identity & Emergency Return Hub",
  bio: "Welcome to my public DataKey card. Reach out using the links or message form below.",
  location_label: "",
  avatar_url: "",
  masked_owner_phone: "",
  public_email: "",
  blood_group: "",
  allergies: "",
  critical_medical_notes: "",
  emergency_instructions:
    "If you found this item or want to get in touch, send a quick message or attach your location below.",
  custom_links: [],
  emergency_contacts: [],
  ...DEFAULT_VISIBILITY_SETTINGS,
};

export const DEFAULT_FOLDERS: VaultFolder[] = [
  { id: "personal", name: "Personal", icon: "User" },
  { id: "finance", name: "Financial", icon: "CreditCard" },
  { id: "infrastructure", name: "Infrastructure", icon: "Server" },
  { id: "emergency", name: "Emergency Docs", icon: "ShieldAlert" },
];
