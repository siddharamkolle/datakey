/**
 * DataKey V2.2 Vault Type Definitions & State Contracts
 * 
 * Volatile in-memory vault state types.
 * Plaintext secrets are strictly ephemeral in memory and NEVER written to localStorage.
 */

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone_number: string;
  priority_order: number;
  is_visible: boolean;
}

export interface PublicEmergencyProfile {
  public_token: string;
  owner_name: string;
  avatar_url?: string;
  is_lost_mode: boolean;
  emergency_instructions: string;
  show_owner_name: boolean;
  show_photo: boolean;
  show_owner_phone: boolean;
  masked_owner_phone: string;
  show_blood_group: boolean;
  blood_group: string;
  show_allergies: boolean;
  allergies: string;
  show_medical_notes: boolean;
  critical_medical_notes: string;
  emergency_contacts: EmergencyContact[];
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

export interface ActiveSession {
  id: string;
  device_label: string;
  ip_truncated: string;
  user_agent: string;
  last_active: string;
  is_current: boolean;
}

export interface VaultFolder {
  id: string;
  name: string;
  icon: string;
}

/**
 * Clean, empty default state templates for new accounts.
 */
export const DEFAULT_PUBLIC_PROFILE: PublicEmergencyProfile = {
  public_token: "",
  owner_name: "",
  is_lost_mode: false,
  emergency_instructions: "If you found this keychain, please submit your contact info or location so the owner can recover it.",
  show_owner_name: true,
  show_photo: false,
  show_owner_phone: true,
  masked_owner_phone: "",
  show_blood_group: false,
  blood_group: "",
  show_allergies: false,
  allergies: "",
  show_medical_notes: false,
  critical_medical_notes: "",
  emergency_contacts: [],
};

export const DEFAULT_FOLDERS: VaultFolder[] = [
  { id: "personal", name: "Personal", icon: "User" },
  { id: "finance", name: "Financial", icon: "CreditCard" },
  { id: "infrastructure", name: "Infrastructure", icon: "Server" },
  { id: "emergency", name: "Emergency Docs", icon: "ShieldAlert" },
];
