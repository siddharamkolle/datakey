/**
 * DataKey Configuration
 *
 * Every adjustable setting for DataKey is centralized in this file with plain-English comments.
 *
 * SECURITY RULES:
 * 1. NEVER store secrets, API keys, or private tokens in this file. Secrets belong in environment variables only (.env).
 * 2. Critical security settings have minimum safety thresholds validated at startup.
 */

export interface DataKeyConfig {
  app: {
    name: string;
    description: string;
    canonicalDomain: string;
    supportContact: string;
  };
  visualIdentity: {
    colors: {
      obsidianBlack: string;
      chromeSilver: string;
      silverSecondary: string;
      silverMuted: string;
      borderSubtle: string;
      borderStrong: string;
      surfaceGlass: string;
      surfaceGlassElevated: string;
      surfaceGlassInteractive: string;
    };
    contrastRatioRequirement: number;
  };
  security: {
    pbkdf2: {
      iterations: number;
      minIterations: number;
      hash: "SHA-256";
    };
    argon2id: {
      memoryKiB: number;
      iterations: number;
      parallelism: number;
      hashLength: number;
      minMemoryKiB: number;
      minIterations: number;
    };
    passwords: {
      minMasterPasswordLength: number;
      hardMinimumMasterPasswordLength: number;
    };
    sessions: {
      autoLockMinutes: number;
      tabHiddenLockSeconds: number;
      minAutoLockMinutes: number;
      cookieDurationHours: number;
    };
    retention: {
      recycleBinRetentionDays: number;
      finderDataRetentionDays: number;
    };
    storage: {
      maxFileSizeBytes: number;
      chunkSizeBytes: number;
      backupPartSizeBytes: number;
      minChunkSizeBytes: number;
    };
    rateLimits: {
      finderFormSubmissionsPerHour: number;
      authAttemptsPer15Minutes: number;
    };
    publicProfileDefaults: {
      showOwnerName: boolean;
      showMaskedPhone: boolean;
      showBloodGroup: boolean;
      showAllergies: boolean;
      showMedicalNotes: boolean;
      tokenLengthChars: number;
    };
  };
}

export const datakeyConfig: DataKeyConfig = {
  app: {
    name: "DataKey",
    description: "Personal Public Hub & Encrypted Private Vault",
    canonicalDomain: "https://datakey.app",
    supportContact: "security@datakey.app",
  },

  // Monochrome Visual Identity: Obsidian Black (#080808) & Chrome Silver (#cdcbca)
  visualIdentity: {
    colors: {
      obsidianBlack: "#080808",
      chromeSilver: "#cdcbca",
      silverSecondary: "rgba(205, 203, 202, 0.75)",
      silverMuted: "rgba(205, 203, 202, 0.45)",
      borderSubtle: "rgba(205, 203, 202, 0.15)",
      borderStrong: "rgba(205, 203, 202, 0.40)",
      surfaceGlass: "rgba(205, 203, 202, 0.04)",
      surfaceGlassElevated: "rgba(205, 203, 202, 0.08)",
      surfaceGlassInteractive: "rgba(205, 203, 202, 0.12)",
    },
    contrastRatioRequirement: 4.5,
  },

  security: {
    // Simple standard Web Crypto PBKDF2-SHA256 Key Derivation
    pbkdf2: {
      iterations: 600000,
      minIterations: 100000,
      hash: "SHA-256",
    },

    // Legacy Argon2id settings retained for compatibility with crypto helpers
    argon2id: {
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
      minMemoryKiB: 16384,
      minIterations: 2,
    },

    passwords: {
      minMasterPasswordLength: 8,
      hardMinimumMasterPasswordLength: 8,
    },

    sessions: {
      autoLockMinutes: 15,
      tabHiddenLockSeconds: 180,
      minAutoLockMinutes: 1,
      cookieDurationHours: 12,
    },

    retention: {
      recycleBinRetentionDays: 30,
      finderDataRetentionDays: 30,
    },

    storage: {
      maxFileSizeBytes: 25 * 1024 * 1024, // 25 MiB per file (stored encrypted in free DB)
      chunkSizeBytes: 2 * 1024 * 1024,    // 2 MiB encrypted chunks
      backupPartSizeBytes: 10 * 1024 * 1024,
      minChunkSizeBytes: 64 * 1024,
    },

    rateLimits: {
      finderFormSubmissionsPerHour: 10,
      authAttemptsPer15Minutes: 10,
    },

    publicProfileDefaults: {
      showOwnerName: true,
      showMaskedPhone: true,
      showBloodGroup: false,
      showAllergies: false,
      showMedicalNotes: false,
      tokenLengthChars: 16,
    },
  },
};

export function validateSecurityConfig(config: DataKeyConfig = datakeyConfig): void {
  const { security } = config;

  if (security.pbkdf2.iterations < security.pbkdf2.minIterations) {
    throw new Error(
      `[SECURITY ERROR] PBKDF2 iterations (${security.pbkdf2.iterations}) is below safe minimum (${security.pbkdf2.minIterations}).`
    );
  }

  if (security.passwords.minMasterPasswordLength < security.passwords.hardMinimumMasterPasswordLength) {
    throw new Error(
      `[SECURITY ERROR] Master password length (${security.passwords.minMasterPasswordLength}) is below safe minimum (${security.passwords.hardMinimumMasterPasswordLength}).`
    );
  }

  if (security.sessions.autoLockMinutes < security.sessions.minAutoLockMinutes) {
    throw new Error(
      `[SECURITY ERROR] Auto-lock minutes (${security.sessions.autoLockMinutes}) cannot be less than ${security.sessions.minAutoLockMinutes} minute.`
    );
  }

  if (security.storage.chunkSizeBytes < security.storage.minChunkSizeBytes) {
    throw new Error(
      `[SECURITY ERROR] File chunk size (${security.storage.chunkSizeBytes} bytes) is below safe minimum (${security.storage.minChunkSizeBytes} bytes).`
    );
  }
}

validateSecurityConfig();
