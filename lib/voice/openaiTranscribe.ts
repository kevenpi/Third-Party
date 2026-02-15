/**
 * OpenAI gpt-4o-transcribe-diarize: transcription + diarization in one call.
 * Returns segments with local speaker labels (S0, S1, or A, B, ...).
 */

import OpenAI, { toFile } from "openai";
import type { DiarizedSegment } from "./types";
import { getOpenAIApiKey } from "@/lib/openaiKey";

function getClient(): OpenAI {
  const key = getOpenAIApiKey();
  if (!key) throw new Error("Missing OpenAI key (set OPENAI_API_KEY or CHATGPT_API_KEY)");
  return new OpenAI({ apiKey: key });
}

export type TranscribeDiarizeResult = {
  text: string;
  duration_sec?: number;
  segments: DiarizedSegment[];
};

/**
 * Transcribe + diarize a single audio file using gpt-4o-transcribe-diarize.
 * Request diarized_json to get speaker segments.
 */
export async function transcribeDiarize(
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
