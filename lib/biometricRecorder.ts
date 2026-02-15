/**
 * Client-side biometric recorder.
 *
 * Source A — Voice stress analysis (always available):
 *   Uses the Web Audio AnalyserNode to extract pitch (autocorrelation),
 *   speech rate (transcript word count over time), energy (RMS), and
 *   pause ratio.  These are combined into a composite stress score 0-100.
 *   Synthetic HR / HRV are estimated from voice stress.
 *
 * Source B — Apple Watch via HealthKit (when available):
 *   Real HR/HRV data pushed to /api/biometrics/ingest and merged in.
 */

import type { BiometricSample } from "@shared/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HR_BASELINE = 68;
const HRV_BASELINE = 50;
const STRESS_BASELINE = 18;

// Pitch detection range (human speech fundamentals)
const PITCH_MIN_HZ = 70;
const PITCH_MAX_HZ = 400;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let recording = false;
let sessionId: string | null = null;
let startedAtMs = 0;
let samples: BiometricSample[] = [];
let baselinePitch = 0;
let baselineSpeechRate = 0;
let baselineEnergy = 0;
let calibrationSamples = 0;

// Apple Watch data pushed via /api/biometrics/ingest
let watchHr: number | null = null;
let watchHrv: number | null = null;

// Rolling transcript state (set externally by ConversationListener)
let rollingWordCount = 0;
let lastWordCountUpdate = 0;

// ---------------------------------------------------------------------------
// Pitch detection via autocorrelation
// ---------------------------------------------------------------------------

function detectPitch(buffer: Float32Array, sampleRate: number): number {
  // Autocorrelation-based pitch detection
  const minLag = Math.floor(sampleRate / PITCH_MAX_HZ);
  const maxLag = Math.floor(sampleRate / PITCH_MIN_HZ);
  if (maxLag >= buffer.length) return 0;

  let bestCorrelation = 0;
  let bestLag = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - lag; i++) {
      correlation += buffer[i] * buffer[i + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation < 0.01) return 0;
  return sampleRate / bestLag;
}

/**
 * Compute RMS energy from an audio buffer.
 */
function computeEnergy(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

// ---------------------------------------------------------------------------
// Voice stress composite
// ---------------------------------------------------------------------------

function computeVoiceStress(
  pitch: number,
  speechRate: number,
  energy: number
): number {
  // Deviations from baseline (calibrated from first 5s)
  const pitchDev =
    baselinePitch > 0
      ? Math.min(1, Math.abs(pitch - baselinePitch) / (baselinePitch * 0.5))
      : 0;
  const speechDev =
    baselineSpeechRate > 0
      ? Math.min(
          1,
          Math.abs(speechRate - baselineSpeechRate) /
            Math.max(1, baselineSpeechRate * 0.6)
        )
      : 0;
  const energyDev =
    baselineEnergy > 0
      ? Math.min(1, Math.max(0, energy - baselineEnergy) / (baselineEnergy * 2))
      : 0;

  // Weighted composite
  const raw =
    pitchDev * 0.35 + speechDev * 0.25 + energyDev * 0.2 + Math.random() * 0.05; // small jitter for natural look

  // Scale to 0-100 with baseline offset
  return Math.round(
    Math.min(100, Math.max(0, STRESS_BASELINE + raw * 70))
  );
}

function estimateHR(stress: number): number {
  // HR rises linearly with stress above baseline
  const stressAboveBaseline = Math.max(0, stress - STRESS_BASELINE);
  const hrIncrease = (stressAboveBaseline / 80) * 35; // max +35 bpm
  const jitter = (Math.random() - 0.5) * 3;
  return Math.round(
    Math.min(130, Math.max(55, HR_BASELINE + hrIncrease + jitter))
  );
}

function estimateHRV(stress: number): number {
  // HRV drops as stress rises
  const stressAboveBaseline = Math.max(0, stress - STRESS_BASELINE);
  const hrvDrop = (stressAboveBaseline / 80) * 30; // max -30 ms
  const jitter = (Math.random() - 0.5) * 3;
  return Math.round(
    Math.min(70, Math.max(15, HRV_BASELINE - hrvDrop + jitter))
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start biometric recording for a conversation session. */
export function startBiometricRecording(sid: string) {
  recording = true;
  sessionId = sid;
  startedAtMs = Date.now();
  samples = [];
  baselinePitch = 0;
  baselineSpeechRate = 0;
  baselineEnergy = 0;
  calibrationSamples = 0;
  watchHr = null;
  watchHrv = null;
  rollingWordCount = 0;
  lastWordCountUpdate = Date.now();
}

/** Stop recording and return all collected samples. */
export function stopBiometricRecording(): BiometricSample[] {
  recording = false;
  sessionId = null;
  const result = [...samples];
  samples = [];
  return result;
}

/** Whether biometric recording is currently active. */
export function isBiometricRecording(): boolean {
  return recording;
}

/** Get the current session ID being recorded. */
export function getBiometricSessionId(): string | null {
  return sessionId;
}

/**
 * Record one biometric sample from the current audio state.
 * Call this every ~5 seconds while recording.
 *
 * @param analyser - The AnalyserNode from the audio context
 * @param sampleRate - The audio context sample rate
 * @param currentWordCount - Current total transcript word count
 */
export function recordBiometricSample(
  analyser: AnalyserNode,
  sampleRate: number,
  currentWordCount: number
): BiometricSample | null {
  if (!recording) return null;

  const elapsed = Math.round((Date.now() - startedAtMs) / 1000);

  // Get time-domain data for pitch detection
  const timeDomain = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(timeDomain);

  const pitch = detectPitch(timeDomain, sampleRate);
  const energy = computeEnergy(timeDomain);

  // Speech rate: words per minute based on rolling word count
  const timeSinceLastUpdate = Math.max(1, (Date.now() - lastWordCountUpdate) / 1000);
  const newWords = Math.max(0, currentWordCount - rollingWordCount);
  const speechRate = (newWords / timeSinceLastUpdate) * 60; // WPM
  rollingWordCount = currentWordCount;
  lastWordCountUpdate = Date.now();

  // Calibrate baseline from first 5 seconds (first ~1 sample)
  if (calibrationSamples < 2 && pitch > 0) {
    calibrationSamples++;
    baselinePitch =
      baselinePitch === 0
        ? pitch
        : baselinePitch * 0.6 + pitch * 0.4;
    baselineEnergy =
      baselineEnergy === 0
        ? energy
        : baselineEnergy * 0.6 + energy * 0.4;
    baselineSpeechRate =
      baselineSpeechRate === 0
        ? speechRate
        : baselineSpeechRate * 0.6 + speechRate * 0.4;
  }

  const stress = computeVoiceStress(pitch, speechRate, energy);
  const hr = watchHr ?? estimateHR(stress);
  const hrv = watchHrv ?? estimateHRV(stress);

  const sample: BiometricSample = {
    elapsed,
    hr,
    hrv,
    stress,
    voicePitch: Math.round(pitch),
    speechRate: Math.round(speechRate),
    audioEnergy: Math.round(energy * 1000) / 1000,
    source: watchHr !== null ? "combined" : "voice",
  };

  samples.push(sample);
  return sample;
}

/**
 * Inject Apple Watch data (called when /api/biometrics/ingest receives data).
 * The next recorded sample will use these values for HR/HRV.
 */
export function injectWatchData(hr: number, hrv: number) {
  watchHr = hr;
  watchHrv = hrv;
}

/** Get all samples collected so far (without stopping). */
export function getCurrentSamples(): BiometricSample[] {
  return [...samples];
}
