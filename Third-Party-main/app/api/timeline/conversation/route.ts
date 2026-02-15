import { NextRequest, NextResponse } from "next/server";
import { getBubbleById } from "@/lib/timelineStorage";
import { getRecordingSession } from "@/lib/awarenessStorage";
import { loadBiometricData } from "@/lib/biometricStorage";
import * as voiceStorage from "@/lib/voice/speakerStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const bubble = await getBubbleById(id);
    if (!bubble) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const session = await getRecordingSession(bubble.sessionId);
    const duration = Math.max(1, Math.round(bubble.durationSec));
    const minutes = Math.floor(duration / 60);
    const words = session?.evidence?.transcriptWords ?? 0;
    const confidence =
      session?.evidence && session.evidence.samples > 0
        ? session.evidence.transcriptConfidenceSum / session.evidence.samples
        : 0;

    // Load biometric data for this session
    let biometricData = null;
    try {
      biometricData = await loadBiometricData(bubble.sessionId);
    } catch {
      /* not available */
    }

    // Load transcript segments from the voice pipeline
    let transcriptSegments: {
      speaker: string;
      text: string;
      startMs: number;
      endMs: number;
    }[] = [];
    try {
      const speakers = voiceStorage.loadSpeakers("default");
      if (bubble.voiceConversationId) {
        const segments = voiceStorage.getConversationSegments(bubble.voiceConversationId);
        transcriptSegments = segments.map((seg) => {
          const speaker = speakers.find((s) => s.id === seg.speaker_global_id);
          return {
            speaker: speaker?.display_name ?? seg.speaker_local,
            text: seg.text,
            startMs: seg.start_ms,
            endMs: seg.end_ms,
          };
        });
      }
      if (transcriptSegments.length === 0) {
        // Fallback: match by timestamp window
        const conversations = voiceStorage.listConversations("default");
        for (const convo of conversations) {
          const segments = voiceStorage.getConversationSegments(convo.id);
          if (segments.length === 0) continue;
          const convoStart = new Date(convo.started_at).getTime();
          const sessionStart = new Date(session?.startedAt ?? bubble.date).getTime();
          const timeDiff = Math.abs(convoStart - sessionStart);
          if (timeDiff < 5 * 60 * 1000) {
            transcriptSegments = segments.map((seg) => {
              const speaker = speakers.find((s) => s.id === seg.speaker_global_id);
              return {
                speaker: speaker?.display_name ?? seg.speaker_local,
                text: seg.text,
                startMs: seg.start_ms,
                endMs: seg.end_ms,
              };
            });
            break;
          }
        }
      }
    } catch {
      /* voice pipeline data not available */
    }

    // Build AI narrative from actual data
    let aiNarrative = "";
    if (biometricData?.overallInsight) {
      aiNarrative = biometricData.overallInsight;
    } else if (transcriptSegments.length > 0) {
      const speakerSet = new Set(transcriptSegments.map((s) => s.speaker));
      const totalWords = transcriptSegments.reduce(
        (sum, s) => sum + s.text.split(/\s+/).length,
        0
      );
      aiNarrative = `Conversation lasted ${minutes} minute${minutes === 1 ? "" : "s"} with ${bubble.person}. ${totalWords} words transcribed across ${speakerSet.size} speaker${speakerSet.size !== 1 ? "s" : ""}.`;
    } else if (words > 0) {
      aiNarrative = `Conversation lasted ${minutes} minute${minutes === 1 ? "" : "s"} with ${bubble.person}. Live transcript captured about ${words} words with confidence ${(confidence * 100).toFixed(0)}%.`;
    } else if (bubble.transcriptSnippet && bubble.transcriptSnippet.trim().length > 0) {
      aiNarrative = bubble.transcriptSnippet.trim();
    } else {
      aiNarrative = `Conversation lasted ${minutes} minute${minutes === 1 ? "" : "s"} with ${bubble.person}.`;
    }

    // Build key moments from biometric correlations or transcript
    const keyMoments: {
      id: string;
      timestamp: number;
      timeDisplay: string;
      description: string;
      color: string;
    }[] = [];

    if (bubble.highlightPoints && bubble.highlightPoints.length > 0) {
      for (const hl of bubble.highlightPoints) {
        keyMoments.push({
          id: hl.id,
          timestamp: hl.timestampSec,
          timeDisplay: formatTime(hl.timestampSec),
          description: hl.label,
          color:
            hl.type === "positive"
              ? "#7AB89E"
              : hl.type === "missed_bid"
                ? "#B84A3A"
                : hl.type === "pattern"
                  ? "#D4B07A"
                  : bubble.color,
        });
      }
    } else if (biometricData?.messageCorrelations?.length) {
      for (const corr of biometricData.messageCorrelations) {
        const mins = Math.floor(corr.elapsed / 60);
        const secs = corr.elapsed % 60;
        keyMoments.push({
          id: `bio-${corr.elapsed}`,
          timestamp: corr.elapsed,
          timeDisplay: `${mins}:${String(secs).padStart(2, "0")}`,
          description: corr.annotation?.label
            ? `${corr.annotation.label}: ${corr.messagePreview}`
            : corr.messagePreview,
          color:
            corr.annotation?.type === "positive"
              ? "#7AB89E"
              : corr.annotation?.type === "missed_bid"
                ? "#B84A3A"
                : corr.annotation?.type === "pattern"
                  ? "#D4B07A"
                  : "#D4806A",
        });
      }
    }

    // If no bio moments, create moments from transcript segments
    if (keyMoments.length === 0 && transcriptSegments.length > 0) {
      // Mark conversation start, midpoint speaker change, and end
      keyMoments.push({
        id: "start",
        timestamp: Math.round(transcriptSegments[0].startMs / 1000),
        timeDisplay: formatTime(Math.round(transcriptSegments[0].startMs / 1000)),
        description: `Conversation begins with ${transcriptSegments[0].speaker}`,
        color: bubble.color,
      });

      // Find first speaker change
      let prevSpeaker = transcriptSegments[0].speaker;
      for (const seg of transcriptSegments.slice(1)) {
        if (seg.speaker !== prevSpeaker) {
          keyMoments.push({
            id: `change-${seg.startMs}`,
            timestamp: Math.round(seg.startMs / 1000),
            timeDisplay: formatTime(Math.round(seg.startMs / 1000)),
            description: `${seg.speaker} starts speaking`,
            color: "#6AAAB4",
          });
          break;
        }
        prevSpeaker = seg.speaker;
      }

      const lastSeg = transcriptSegments[transcriptSegments.length - 1];
      keyMoments.push({
        id: "end",
        timestamp: Math.round(lastSeg.endMs / 1000),
        timeDisplay: formatTime(Math.round(lastSeg.endMs / 1000)),
        description: "Conversation ends",
        color: bubble.color,
      });
    }

    // Fallback moments if nothing else
    if (keyMoments.length === 0) {
      keyMoments.push(
        {
          id: "1",
          timestamp: Math.max(1, Math.round(duration * 0.2)),
          timeDisplay: formatTime(Math.round(duration * 0.2)),
          description: "Conversation begins",
          color: bubble.color,
        },
        {
          id: "2",
          timestamp: Math.max(2, Math.round(duration * 0.8)),
          timeDisplay: formatTime(Math.round(duration * 0.8)),
          description: "Conversation ends",
          color: bubble.color,
        }
      );
    }

    const data = {
      person: bubble.person,
      date: bubble.date,
      time: bubble.time,
      duration,
      color: bubble.color,
      audioUrl: `/api/conversationAwareness/clip?sessionId=${encodeURIComponent(bubble.sessionId)}`,
      aiNarrative,
      keyMoments,
      transcriptSegments:
        transcriptSegments.length > 0 ? transcriptSegments : undefined,
      biometricData: biometricData ?? undefined,
      faceIdentification: session?.faceIdentification ?? undefined,
      unknownFaceFramePath: session?.unknownFaceFramePath ?? undefined,
    };

    return NextResponse.json({ conversation: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
