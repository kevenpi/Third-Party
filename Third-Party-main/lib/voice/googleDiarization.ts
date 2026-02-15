/**
 * Google Cloud Speech-to-Text with speaker diarization.
 * Requires: GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON) or
 * GOOGLE_CLOUD_PROJECT + explicit credentials.
 */

export interface DiarizedWord {
  word: string;
  speakerTag: number;
  startOffsetSeconds?: number;
  endOffsetSeconds?: number;
}

export interface DiarizedSegment {
  speakerTag: number;
  text: string;
  startOffsetSeconds?: number;
  endOffsetSeconds?: number;
}

export interface DiarizedTranscriptionResult {
  segments: DiarizedSegment[];
  words: DiarizedWord[];
  fullTranscript: string;
  speakerCount: number;
}

async function getSpeechClient() {
  const speech = await import("@google-cloud/speech");
  return new speech.SpeechClient();
}

/**
 * Transcribe audio with speaker diarization.
 * Audio should be WAV/RAW: 16-bit PCM, 16 kHz mono (or we'll use default config).
 */
export async function transcribeWithDiarization(
  audioBuffer: Buffer,
  options: {
    sampleRateHertz?: number;
    encoding?: "LINEAR16" | "FLAC" | "WEBM_OPUS" | "MP3";
    languageCode?: string;
    minSpeakerCount?: number;
    maxSpeakerCount?: number;
  } = {}
): Promise<DiarizedTranscriptionResult> {
  const {
    sampleRateHertz = 16000,
    encoding = "LINEAR16",
    languageCode = "en-US",
    minSpeakerCount = 1,
    maxSpeakerCount = 6,
  } = options;

  const client = await getSpeechClient();

  const config = {
    encoding: encoding as "LINEAR16",
    sampleRateHertz,
    languageCode,
    diarizationConfig: {
      enableSpeakerDiarization: true,
      minSpeakerCount,
      maxSpeakerCount,
    },
    model: "phone_call",
  };

  const [response] = await client.recognize({
    config,
    audio: { content: audioBuffer.toString("base64") },
  });

  const words: DiarizedWord[] = [];
  const speakerSet = new Set<number>();

  const lastResult = response.results?.[response.results.length - 1];
  const alternative = lastResult?.alternatives?.[0];
  if (!alternative?.words?.length) {
    return {
      segments: [],
      words: [],
      fullTranscript: (response.results ?? [])
        .map((r) => r.alternatives?.[0]?.transcript ?? "")
        .join(" "),
      speakerCount: 0,
    };
  }

  for (const w of alternative.words) {
    const tag = (w as { speakerTag?: number }).speakerTag ?? 0;
    speakerSet.add(tag);
    words.push({
      word: w.word ?? "",
      speakerTag: tag,
      startOffsetSeconds: (w as { startTime?: { seconds?: number } }).startTime?.seconds,
      endOffsetSeconds: (w as { endTime?: { seconds?: number } }).endTime?.seconds,
    });
  }

  // Build segments: consecutive words with same speaker
  const segments: DiarizedSegment[] = [];
  let currentSegment: DiarizedSegment | null = null;

  for (const w of words) {
    if (!currentSegment || currentSegment.speakerTag !== w.speakerTag) {
      currentSegment = {
        speakerTag: w.speakerTag,
        text: w.word,
        startOffsetSeconds: w.startOffsetSeconds,
        endOffsetSeconds: w.endOffsetSeconds,
      };
      segments.push(currentSegment);
    } else {
      currentSegment.text += " " + w.word;
      currentSegment.endOffsetSeconds = w.endOffsetSeconds;
    }
  }

  const fullTranscript = segments.map((s) => `Speaker ${s.speakerTag}: ${s.text}`).join("\n");

  return {
    segments,
    words,
    fullTranscript: (response.results ?? []).map((r) => r.alternatives?.[0]?.transcript ?? "").join(" "),
    speakerCount: speakerSet.size,
  };
}
