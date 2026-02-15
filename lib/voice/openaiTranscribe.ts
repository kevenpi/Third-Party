/**
 * Diarization backend:
 * - OpenAI gpt-4o-transcribe-diarize (default)
 * - Optional pyannote service when configured
 */

import OpenAI, { toFile } from "openai";
import type { DiarizedSegment } from "./types";
import { getOpenAIApiKey, hasOpenAIApiKey } from "@/lib/openaiKey";

const PYANNOTE_TIMEOUT_MS = 60_000;

function getClient(): OpenAI {
  const key = getOpenAIApiKey();
  if (!key) throw new Error("Missing OpenAI key (set OPENAI_API_KEY or CHATGPT_API_KEY)");
  return new OpenAI({ apiKey: key });
}

function normalizedPyannoteUrl(): string | null {
  const direct = process.env.PYANNOTE_DIARIZER_URL?.trim();
  if (direct) return direct;
  const base = process.env.PYANNOTE_SERVICE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/diarize`;
}

function prefersPyannote(): boolean {
  const raw = (process.env.VOICE_DIARIZATION_BACKEND ?? "").trim().toLowerCase();
  return raw === "pyannote";
}

export type TranscribeDiarizeResult = {
  text: string;
  duration_sec?: number;
  segments: DiarizedSegment[];
};

async function transcribeDiarizeOpenAI(
  file: Blob | Buffer,
  options?: { language?: string }
): Promise<TranscribeDiarizeResult> {
  const buffer = file instanceof Buffer ? file : Buffer.from(await (file as Blob).arrayBuffer());
  const upload = await toFile(buffer, "audio.wav");

  const client = getClient();
  const resp = await client.audio.transcriptions.create({
    model: "gpt-4o-transcribe-diarize",
    file: upload,
    response_format: "diarized_json" as "json",
    language: options?.language ?? undefined,
  });

  const anyResp = resp as {
    text?: string;
    duration?: number;
    segments?: Array<{
      id?: string;
      start?: number;
      end?: number;
      speaker?: string;
      text?: string;
      confidence?: number;
    }>;
  };

  const text = anyResp.text ?? "";
  const segments: DiarizedSegment[] = (anyResp.segments ?? []).map((s) => ({
    speaker: s.speaker ?? "S?",
    start_ms: Math.round((s.start ?? 0) * 1000),
    end_ms: Math.round((s.end ?? 0) * 1000),
    text: s.text ?? "",
    confidence: s.confidence,
  }));

  return {
    text,
    duration_sec: anyResp.duration,
    segments,
  };
}

type PyannoteResponse = {
  duration_sec?: number;
  text?: string;
  segments?: Array<{
    speaker?: string;
    start_ms?: number;
    end_ms?: number;
    start?: number;
    end?: number;
    confidence?: number;
    text?: string;
  }>;
};

async function transcribeDiarizePyannote(
  file: Blob | Buffer,
  options?: { language?: string }
): Promise<TranscribeDiarizeResult> {
  const url = normalizedPyannoteUrl();
  if (!url) {
    throw new Error("Pyannote diarizer is not configured. Set PYANNOTE_DIARIZER_URL or PYANNOTE_SERVICE_URL.");
  }
  const buffer = file instanceof Buffer ? file : Buffer.from(await (file as Blob).arrayBuffer());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PYANNOTE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Language": options?.language ?? "en",
      },
      body: buffer as unknown as BodyInit,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Pyannote diarizer ${response.status}`);
    }
    const payload = (await response.json()) as PyannoteResponse;
    const mappedSegments: DiarizedSegment[] = (payload.segments ?? [])
      .map((segment) => {
        const startMs =
          typeof segment.start_ms === "number"
            ? Math.round(segment.start_ms)
            : typeof segment.start === "number"
              ? Math.round(segment.start * 1000)
              : 0;
        const endMs =
          typeof segment.end_ms === "number"
            ? Math.round(segment.end_ms)
            : typeof segment.end === "number"
              ? Math.round(segment.end * 1000)
              : startMs;
        return {
          speaker: segment.speaker ?? "S?",
          start_ms: Math.max(0, startMs),
          end_ms: Math.max(startMs, endMs),
          confidence: segment.confidence,
          text: segment.text ?? "",
        };
      })
      .filter((segment) => segment.end_ms > segment.start_ms);

    const durationFromSegments =
      mappedSegments.length > 0
        ? mappedSegments[mappedSegments.length - 1].end_ms / 1000
        : 0;

    return {
      text: payload.text ?? "",
      duration_sec: payload.duration_sec ?? durationFromSegments,
      segments: mappedSegments,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function isAnyDiarizerConfigured(): boolean {
  return Boolean(hasOpenAIApiKey() || normalizedPyannoteUrl());
}

export function activeDiarizationBackend(): "openai" | "pyannote" {
  if (prefersPyannote() || (!hasOpenAIApiKey() && normalizedPyannoteUrl())) {
    return "pyannote";
  }
  return "openai";
}

/**
 * Transcribe + diarize using configured backend.
 * If pyannote is selected and fails, falls back to OpenAI when available.
 */
export async function transcribeDiarize(
  file: Blob | Buffer,
  options?: { language?: string }
): Promise<TranscribeDiarizeResult> {
  const backend = activeDiarizationBackend();
  if (backend === "pyannote") {
    try {
      return await transcribeDiarizePyannote(file, options);
    } catch (error) {
      if (!hasOpenAIApiKey()) {
        throw error;
      }
      console.warn("Pyannote diarization failed; falling back to OpenAI:", error);
      return transcribeDiarizeOpenAI(file, options);
    }
  }
  return transcribeDiarizeOpenAI(file, options);
}
