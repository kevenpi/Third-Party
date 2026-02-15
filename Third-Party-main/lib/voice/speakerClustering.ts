/**
 * Cross-episode speaker clustering: match new embeddings to existing speakers
 * or create new ones. Uses cosine similarity + centroid (EMA) updates.
 */

import type { Embedding } from "./types";

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a)) || 1e-9;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  return dot(a, b) / (norm(a) * norm(b));
}

export type SpeakerCandidate = {
  speakerId: string;
  centroid: Embedding;
};

/**
 * Match one embedding against existing speaker centroids.
 * Returns best speakerId if score >= threshold, else null.
 */
export function matchSpeaker(
  embedding: Embedding,
  candidates: SpeakerCandidate[],
  threshold: number
): { speakerId: string | null; score: number } {
  let best: { speakerId: string | null; score: number } = { speakerId: null, score: -1 };

  for (const c of candidates) {
    const score = cosineSimilarity(embedding, c.centroid);
    if (score > best.score) best = { speakerId: c.speakerId, score };
  }
  if (best.score >= threshold) return best;
  return { speakerId: null, score: best.score };
}

/**
 * Update centroid with exponential moving average.
 */
export function updateCentroid(
  oldCentroid: Embedding,
  newEmbedding: Embedding,
  alpha = 0.15
): Embedding {
  if (oldCentroid.length !== newEmbedding.length) return newEmbedding.slice();
  const out = oldCentroid.slice();
  for (let i = 0; i < out.length; i++) {
    out[i] = (1 - alpha) * out[i] + alpha * newEmbedding[i];
  }
  return out;
}
