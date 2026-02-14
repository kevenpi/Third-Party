/**
 * Speaker embedding: turn a segment of audio into a "voiceprint" vector.
 * Uses SPEAKER_EMBEDDER_URL (ECAPA-TDNN service) when set; otherwise placeholder for testing.
 */

import type { Embedding } from "./types";

const EMBEDDING_DIM = 192; // ECAPA-TDNN typical size
const EMBEDDER_URL = process.env.SPEAKER_EMBEDDER_URL;
const EMBEDDER_TIMEOUT_MS = 30_000;
const EMBEDDER_RETRIES = 1;

/**
 * Compute speaker embedding for a WAV buffer (16kHz mono 16-bit typical).
 * - If SPEAKER_EMBEDDER_URL is set: POST audio with timeout + retry; fallback to placeholder on failure.
 * - Else: return a deterministic placeholder so clustering still runs.
 */
export async function computeSpeakerEmbedding(wavBuffer: Buffer): Promise<Embedding> {
  if (EMBEDDER_URL) {
    for (let attempt = 0; attempt <= EMBEDDER_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), EMBEDDER_TIMEOUT_MS);
        const res = await fetch(EMBEDDER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: wavBuffer as unknown as BodyInit,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Embedder ${res.status}`);
        const data = (await res.json()) as { embedding?: number[] };
        if (!Array.isArray(data.embedding)) throw new Error("Invalid embedder response");
        return data.embedding;
      } catch (err) {
        const isLast = attempt === EMBEDDER_RETRIES;
        if (isLast) {
          console.warn("Speaker embedder unavailable, using placeholder:", err instanceof Error ? err.message : err);
          break;
        }
      }
    }
  }

  // Placeholder: deterministic pseudo-embedding so clustering still runs
  const emb: Embedding = [];
  const step = Math.max(1, Math.floor(wavBuffer.length / EMBEDDING_DIM));
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const byte = wavBuffer[i * step % wavBuffer.length] ?? 0;
    emb.push((byte / 128 - 1) * 0.1);
  }
  const n = norm(emb);
  for (let i = 0; i < emb.length; i++) emb[i] /= n;
  return emb;
}

function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s) || 1e-9;
}
