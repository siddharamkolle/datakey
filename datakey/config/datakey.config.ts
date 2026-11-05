/**
 * DataKey Configuration
 * 
 * Every adjustable setting for DataKey is centralized in this file with plain-English comments.
 * 
 * SECURITY RULES:
 * 1. NEVER store secrets, API keys, or private tokens in this file. Secrets belong in environment variables only (.env).
 * 2. Critical security settings have hardcoded minimum safety thresholds. The app will refuse to boot
 *    if any security setting is lowered below its safe threshold.
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
      minAccountPasswordLength: number;
      hardMinimumMasterPasswordLength: number;
    };
    sessions: {
      autoLockMinutes: number;
      tabHiddenLockSeconds: number;
      minAutoLockMinutes: number;
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
    description: "Zero-Knowledge Personal Identity & Offline Emergency Vault",
    canonicalDomain: "https://datakey.app",
    supportContact: "security@datakey.app",
  },

  // Monochrome Visual Identity: Obsidian Black (#080808) & Chrome Silver (#cdcbca)
  visualIdentity: {
    colors: {
      obsidianBlack: "#080808",
      chromeSilver: "#cdcbca",
      silverSecondary: "rgba(205, 203, 202, 0.75)", // > 4.5:1 contrast against #080808
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
    // Argon2id Key Derivation Parameters for Master Password -> KEK_pass
    argon2id: {
      memoryKiB: 65536, // 64 MiB RAM cost
      iterations: 3,    // 3 passes
      parallelism: 1,   // Single thread
      hashLength: 32,   // 256-bit key
      minMemoryKiB: 16384, // Hard minimum threshold (16 MiB)
      minIterations: 2,    // Hard minimum passes
    },

    passwords: {
      minMasterPasswordLength: 14, // Master password minimum characters
      minAccountPasswordLength: 12,
      hardMinimumMasterPasswordLength: 14, // Absolute lower bound enforced by system
    },

    sessions: {
      autoLockMinutes: 5,        // Inactivity timeout
      tabHiddenLockSeconds: 120, // Lock when browser tab is hidden for 2 minutes
      minAutoLockMinutes: 1,     // Minimum allowed auto-lock timeout
    },

    retention: {
      recycleBinRetentionDays: 30, // Items in trash purged after 30 days
      finderDataRetentionDays: 30, // Finder GPS logs purged after 30 days
    },

    storage: {
      maxFileSizeBytes: 100 * 1024 * 1024, // 100 MiB maximum single file size
      chunkSizeBytes: 2 * 1024 * 1024,      // 2 MiB chunk size for streaming AES-GCM
      backupPartSizeBytes: 10 * 1024 * 1024, // 10 MiB part size for multi-part offline backups
      minChunkSizeBytes: 64 * 1024,         // 64 KiB minimum chunk size
    },

    rateLimits: {
      finderFormSubmissionsPerHour: 5, // Max 5 finder submissions per hour per token/IP
      authAttemptsPer15Minutes: 5,     // Max 5 failed login attempts per 15 minutes
    },

    publicProfileDefaults: {
      showOwnerName: true,
      showMaskedPhone: true,
      showBloodGroup: false,     // Disabled by default; owner explicitly enables
      showAllergies: false,
      showMedicalNotes: false,
      tokenLengthChars: 16,      // 16 random Base62 characters for public URL
    },
  },
};

/**
 * Validates the configuration against critical security floors.
 * Refuses execution if any security-critical parameter is below safe minimums.
 */
export function validateSecurityConfig(config: DataKeyConfig = datakeyConfig): void {
  const { security } = config;

  if (security.argon2id.memoryKiB < security.argon2id.minMemoryKiB) {
    throw new Error(
      `[SECURITY ERROR] Argon2id memory (${security.argon2id.memoryKiB} KiB) is below safe minimum (${security.argon2id.minMemoryKiB} KiB). ` +
      `Lowering memory below this floor makes master passwords vulnerable to GPU/ASIC dictionary attacks.`
    );
  }

  if (security.argon2id.iterations < security.argon2id.minIterations) {
    throw new Error(
      `[SECURITY ERROR] Argon2id iterations (${security.argon2id.iterations}) is below safe minimum (${security.argon2id.minIterations}).`
    );
  }

  if (security.passwords.minMasterPasswordLength < security.passwords.hardMinimumMasterPasswordLength) {
    throw new Error(
      `[SECURITY ERROR] Master password length requirement (${security.passwords.minMasterPasswordLength}) is below safe minimum (${security.passwords.hardMinimumMasterPasswordLength} characters).`
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

// Automatically validate on module import
validateSecurityConfig();

