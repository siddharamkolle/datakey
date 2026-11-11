/**
 * DataKey Demo Seed Script (OFF BY DEFAULT)
 * 
 * SAFETY NOTICE:
 * This script is ONLY for local development testing.
 * It contains fictitious, synthetic test records and is NEVER run in production.
 * Execution requires explicitly setting ALLOW_DEMO_SEED=true in the environment.
 */

export const DEMO_PUBLIC_PROFILE = {
  public_token: "demo-test-token-1234",
  lost_mode: false,
  owner_name: "Demo Vault Owner",
  masked_phone: "+1 (555) •••-0199",
  blood_group: "O+",
  allergies: "None Reported",
  critical_medical_notes: "Synthetic demo medical note for local testing.",
  emergency_instructions: "If found, please notify the owner via the emergency transmission form.",
  visibility_settings: {
    owner_name: true,
    masked_phone: true,
    blood_group: false,
    allergies: false,
    medical_notes: false,
  },
};

export const DEMO_EMERGENCY_CONTACTS = [
  {
    name: "Emergency Contact A",
    relationship: "Colleague",
    phone: "+1-555-0101",
    priority: 1,
    is_public: true,
  },
  {
    name: "Emergency Contact B",
    relationship: "Family Member",
    phone: "+1-555-0102",
    priority: 2,
    is_public: true,
  },
];

export const DEMO_VAULT_ITEMS = [
  {
    category: "login",
    title: "Demo Work Email",
    username: "demo.user@example.test",
    password: "Example#Password#2026!",
    url: "https://mail.example.test",
    notes: "Local testing credential placeholder.",
  },
  {
    category: "note",
    title: "Demo Server Inventory",
    content: "Cluster Node A: 192.0.2.1\nCluster Node B: 192.0.2.2\n(Synthetic RFC 5737 Test IP addresses)",
  },
];

export async function runDemoSeed() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error(
      "❌ Demo seeding is OFF by default. Set ALLOW_DEMO_SEED=true in .env.local to execute this script in development."
    );
    return;
  }

  console.log("🌱 Seeding synthetic demo data for local testing...");
  console.log("⚠️ Ensure this is never executed against production databases.");
}

if (require.main === module) {
  runDemoSeed().catch(console.error);
}
