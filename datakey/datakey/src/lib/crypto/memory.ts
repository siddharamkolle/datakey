/**
 * DataKey V2.2 Memory Hygiene Utilities
 * Overwrites sensitive Uint8Array buffers with zeros immediately after use.
 */

export function zeroBuffer(buffer: Uint8Array | null | undefined): void {
  if (!buffer) return;
  try {
    buffer.fill(0);
  } catch {
    // Ignore if already detached or frozen
  }
}

export function zeroBuffers(...buffers: (Uint8Array | null | undefined)[]): void {
  for (const b of buffers) {
    zeroBuffer(b);
  }
}

