import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { BiometricSample } from "@shared/types";
import type { BiometricData, MessageCorrelation } from "@/lib/biometrics";
import {
  saveBiometricData,
  samplesToTimeline,
  computeStats,
} from "@/lib/biometricStorage";
import { getRecordingSession } from "@/lib/awarenessStorage";
import { getBubbleById, saveTimelineBubbleFromSession } from "@/lib/timelineStorage";
import * as voiceStorage from "@/lib/voice/speakerStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/biometrics/analyze
 * After a conversation ends, the client sends biometric samples + transcript.
 * GPT-4o analyzes the data and produces MessageCorrelations and an overallInsight.
 *
 * Body: {
 *   sessionId: string,
 *   person: string,
 *   startTime: string,
 *   biometricSamples: BiometricSample[],
 *   transcript?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      person,
      startTime,
      biometricSamples,
      transcript,
    } = body as {
      sessionId?: string;
      person?: string;
      startTime?: string;
      biometricSamples?: BiometricSample[];
      transcript?: string;
    };

    if (!sessionId || !biometricSamples || biometricSamples.length === 0) {
      return NextResponse.json(
        { error: "Missing sessionId or biometricSamples" },
        { status: 400 }
      );
    }

    const timeline = samplesToTimeline(biometricSamples);
    const stats = computeStats(biometricSamples);
    const durationSec = biometricSamples[biometricSamples.length - 1]?.elapsed ?? 0;
    const durationMin = Math.ceil(durationSec / 60);

    // Build GPT-4o prompt
    const timelineCompact = timeline.map(
      (t) => `${t.elapsed}s: HR=${t.hr} HRV=${t.hrv} Stress=${t.stress}`
    );

    const systemPrompt = `You are a biometric analyst for a relationship coaching app. You analyze conversations by correlating biometric data (heart rate, HRV, stress) with what was being discussed.

You must respond with ONLY valid JSON in this exact format:
{
  "messageCorrelations": [
    {
      "elapsed": <number: seconds into conversation>,
      "messagePreview": "<what was being discussed at this moment>",
      "sender": "<who was speaking>",
      "hrBefore": <number>, "hrAfter": <number>,
      "hrvBefore": <number>, "hrvAfter": <number>,
      "stressBefore": <number>, "stressAfter": <number>,
      "annotation": {
        "type": "observation" | "missed_bid" | "pattern" | "positive",
        "label": "<short label>",
        "text": "<1-2 sentence explanation of what caused the biometric change>",
        "icon": "+" | "!" | "~" | "↑"
      }
    }
  ],
  "overallInsight": "<2-3 sentence narrative summary of the biometric story of this conversation>"
}

Focus on the most significant biometric changes (stress spikes, HR increases, HRV drops). Identify 2-5 key moments. Be specific about what was being discussed and why it affected the user physiologically.`;

    let transcriptForAnalysis = transcript;
    if (!transcriptForAnalysis) {
      const existingBubble = await getBubbleById(`bubble_${sessionId}`);
      if (existingBubble?.voiceConversationId) {
        const segments = voiceStorage.getConversationSegments(existingBubble.voiceConversationId);
        if (segments.length > 0) {
          const speakers = voiceStorage.loadSpeakers("default");
          transcriptForAnalysis = segments
            .slice(0, 120)
            .map((seg) => {
              const speaker = speakers.find((s) => s.id === seg.speaker_global_id);
              return `${speaker?.display_name ?? seg.speaker_local}: ${seg.text}`;
            })
            .join("\n");
        }
      }
    }

    const userMessage = `Conversation with ${person ?? "someone"}, duration ${durationMin} min.

Biometric timeline (sampled every ~5s):
${timelineCompact.join("\n")}

Baseline: HR=${stats.baseline.hr}, HRV=${stats.baseline.hrv}, Stress=${stats.baseline.stress}
Peak: HR=${stats.peak.hr}, HRV=${stats.peak.hrv}, Stress=${stats.peak.stress} at ${stats.peak.elapsedAt}s

${transcriptForAnalysis ? `Transcript:\n${transcriptForAnalysis.slice(0, 3000)}` : "No transcript available — infer conversation content from biometric patterns and timing."}`;

    let messageCorrelations: MessageCorrelation[] = [];
    let overallInsight = "";

    try {
      const openai = new OpenAI();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      const text = response.choices[0]?.message?.content?.trim() ?? "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        messageCorrelations = parsed.messageCorrelations ?? [];
        overallInsight = parsed.overallInsight ?? "";
      }
    } catch (aiErr) {
      console.error("AI biometric analysis failed:", aiErr);
      overallInsight = `Conversation lasted ${durationMin} minute${durationMin === 1 ? "" : "s"} with ${person ?? "someone"}. Peak stress reached ${stats.peak.stress} at ${Math.floor(stats.peak.elapsedAt / 60)}:${String(stats.peak.elapsedAt % 60).padStart(2, "0")}.`;
    }

    // Build BiometricData
    const bioData: BiometricData = {
      participant: person ?? "Unknown",
      startTime: startTime ?? new Date().toISOString(),
      duration: `${durationMin} min`,
      hrTimeline: timeline,
      baseline: stats.baseline,
      peak: stats.peak,
      recovery: stats.recovery,
      messageCorrelations,
      overallInsight,
    };

    // Save to disk
    await saveBiometricData(sessionId, bioData);
    const session = await getRecordingSession(sessionId);
    if (session?.endedAt) {
      await saveTimelineBubbleFromSession(session, {
        highlightPoints: messageCorrelations.slice(0, 6).map((corr, index) => ({
          id: `bio-${index}-${corr.elapsed}`,
          timestampSec: corr.elapsed,
          label: corr.annotation?.label
            ? `${corr.annotation.label}: ${corr.messagePreview}`
            : corr.messagePreview,
          type: corr.annotation?.type ?? "neutral",
        })),
      });
    }

    return NextResponse.json({ biometricData: bioData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
