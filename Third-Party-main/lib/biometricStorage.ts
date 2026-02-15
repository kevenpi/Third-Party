/**
 * Server-side biometric data storage.
 *
 * Live biometric data is saved per-session in data/biometrics/{sessionId}.json.
 * Falls back to the static data/biometrics.json for demo conversations.
 */

import { promises as fs } from "fs";
import path from "path";
import { getDataRoot } from "@/lib/runtimePaths";
import type { BiometricSample } from "@shared/types";
import type { BiometricData, MessageCorrelation } from "@/lib/biometrics";

const DATA_ROOT = getDataRoot();
const BIO_DIR = path.join(DATA_ROOT, "biometrics");

async function ensureDir() {
  await fs.mkdir(BIO_DIR, { recursive: true });
}

function sessionPath(sessionId: string): string {
  return path.join(BIO_DIR, `${sessionId}.json`);
}

/**
 * Save analyzed biometric data for a conversation session.
 */
export async function saveBiometricData(
  sessionId: string,
  data: BiometricData
): Promise<void> {
  await ensureDir();
  await fs.writeFile(sessionPath(sessionId), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Load biometric data for a session. Returns null if not found.
 */
export async function loadBiometricData(
  sessionId: string
): Promise<BiometricData | null> {
  try {
    const raw = await fs.readFile(sessionPath(sessionId), "utf8");
    return JSON.parse(raw) as BiometricData;
  } catch {
    return null;
  }
}

/**
 * Convert raw BiometricSample[] into the BiometricData structure
 * expected by the existing UI.
 */
export function samplesToTimeline(
  samples: BiometricSample[]
): { hr: number; hrv: number; stress: number; elapsed: number }[] {
  return samples.map((s) => ({
    elapsed: s.elapsed,
    hr: s.hr,
    hrv: s.hrv,
    stress: s.stress,
  }));
}

/**
 * Compute baseline, peak, and recovery from samples.
 */
export function computeStats(samples: BiometricSample[]) {
  if (samples.length === 0) {
    return {
      baseline: { hr: 68, hrv: 50, stress: 18 },
      peak: { hr: 68, hrv: 50, stress: 18, elapsedAt: 0 },
      recovery: { minutes: 0 },
    };
  }

  // Baseline: average of first 3 samples
  const baselineSamples = samples.slice(0, Math.min(3, samples.length));
  const baseline = {
    hr: Math.round(baselineSamples.reduce((s, b) => s + b.hr, 0) / baselineSamples.length),
    hrv: Math.round(baselineSamples.reduce((s, b) => s + b.hrv, 0) / baselineSamples.length),
    stress: Math.round(baselineSamples.reduce((s, b) => s + b.stress, 0) / baselineSamples.length),
  };

  // Peak stress
  const peakSample = samples.reduce((best, s) =>
    s.stress > best.stress ? s : best
  );

  // Recovery: time from peak stress back to within 10% of baseline
  let recoveryMinutes = 0;
  const peakIdx = samples.indexOf(peakSample);
  if (peakIdx < samples.length - 1) {
    const threshold = baseline.stress * 1.1;
    for (let i = peakIdx + 1; i < samples.length; i++) {
      if (samples[i].stress <= threshold) {
        recoveryMinutes = Math.round((samples[i].elapsed - peakSample.elapsed) / 60);
        break;
      }
    }
  }

  return {
    baseline,
    peak: {
      hr: peakSample.hr,
      hrv: peakSample.hrv,
      stress: peakSample.stress,
      elapsedAt: peakSample.elapsed,
    },
    recovery: { minutes: recoveryMinutes },
  };
}
