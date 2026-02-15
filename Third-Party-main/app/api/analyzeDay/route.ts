import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeDayWithAgent, transcribeAudioPlaceholder } from "@/lib/claudeAgent";
import { parseSpikesInput, decodeAudioDataUrl } from "@/lib/parsers";
import { AnalyzedDaySchema } from "@/lib/schemas";
import { saveAnalyzedDay } from "@/lib/storage";
import { loadSampleSpikesText, loadSampleTranscript } from "@/lib/sample";

const AnalyzeRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  whoWith: z.string().min(1),
  transcriptText: z.string().optional(),
  audioDataUrl: z.string().optional(),
  spikesText: z.string().optional(),
  useSample: z.boolean().optional()
});

function defaultDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const parsedBody = AnalyzeRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsedBody.data;
    const date = payload.date ?? defaultDate();

    let transcript = payload.transcriptText?.trim() ?? "";
    let spikesText = payload.spikesText ?? "";

    if (payload.useSample) {
      transcript = await loadSampleTranscript();
      spikesText = await loadSampleSpikesText();
    }

    if (!transcript && payload.audioDataUrl) {
      const audioBuffer = decodeAudioDataUrl(payload.audioDataUrl);
      if (audioBuffer) {
        transcript = await transcribeAudioPlaceholder(audioBuffer);
      }
    }

    if (!transcript || transcript.trim().length < 8) {
      return NextResponse.json(
        {
          error: "Transcript is required for analysis."
        },
        { status: 400 }
      );
    }

    const spikes = parseSpikesInput(spikesText);

    const analyzedDay = await analyzeDayWithAgent({
      date,
      whoWith: payload.whoWith.trim(),
      transcript,
      spikes
    });

    const validated = AnalyzedDaySchema.safeParse(analyzedDay);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Analyze output failed schema validation",
          details: validated.error.flatten()
        },
        { status: 500 }
      );
    }

    await saveAnalyzedDay(validated.data);

    return NextResponse.json({ day: validated.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
