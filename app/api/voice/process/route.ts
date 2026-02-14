import { NextRequest, NextResponse } from "next/server";
import { transcribeWithDiarization } from "@/lib/voice/googleDiarization";
import { identifySpeaker } from "@/lib/voice/azureSpeaker";
import { extractSpeakerAudioBuffers } from "@/lib/voice/audioSlice";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Combined: transcribe with diarization (Google) then identify each speaker (Azure).
 * Body: formData with "audio" file, optional "enrolledSpeakers" JSON string:
 *   [{ "profileId": "azure-guid", "personId": "arthur" }]
 * Response: diarized segments with identifiedProfileId and personId when matched.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
      return NextResponse.json(
        { error: "Google Cloud credentials not configured." },
        { status: 503 }
      );
    }
    if (!process.env.AZURE_SPEECH_KEY) {
      return NextResponse.json(
        { error: "Azure Speech not configured." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' file" }, { status: 400 });
    }

    let enrolledSpeakers: { profileId: string; personId: string }[] = [];
    try {
      const raw = formData.get("enrolledSpeakers");
      if (raw && typeof raw === "string") {
        enrolledSpeakers = JSON.parse(raw);
      }
    } catch {
      // ignore invalid JSON
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const minSpeakers = Math.max(1, parseInt(String(formData.get("minSpeakerCount") || "1"), 10));
    const maxSpeakerVal = parseInt(String(formData.get("maxSpeakerCount") || "6"), 10);
    const maxSpeakers = Math.min(10, Math.max(1, maxSpeakerVal));

    const diarized = await transcribeWithDiarization(buffer, {
      languageCode: "en-US",
      minSpeakerCount: minSpeakers,
      maxSpeakerCount: maxSpeakers,
    });

    const profileIds = enrolledSpeakers.map((s) => s.profileId);
    const profileToPerson = new Map(enrolledSpeakers.map((s) => [s.profileId, s.personId]));

    const speakerBuffers = extractSpeakerAudioBuffers(
      buffer,
      diarized.segments,
      16000
    );

    const speakerIdentification = new Map<number, { profileId: string; personId: string; confidence: string }>();

    for (const [speakerTag, audioBuf] of speakerBuffers) {
      if (audioBuf.length < 16000 * 2 * 2) continue; // need at least ~2s of audio for reliable identify
      try {
        const result = await identifySpeaker(profileIds, audioBuf);
        if (result && profileToPerson.has(result.identifiedProfileId)) {
          speakerIdentification.set(speakerTag, {
            profileId: result.identifiedProfileId,
            personId: profileToPerson.get(result.identifiedProfileId)!,
            confidence: result.confidence,
          });
        }
      } catch (e) {
        console.warn("Identify failed for speaker", speakerTag, e);
      }
    }

    const segmentsWithId = diarized.segments.map((seg) => {
      const id = speakerIdentification.get(seg.speakerTag);
      return {
        ...seg,
        identifiedProfileId: id?.profileId ?? null,
        identifiedPersonId: id?.personId ?? null,
        confidence: id?.confidence ?? null,
      };
    });

    return NextResponse.json({
      segments: segmentsWithId,
      words: diarized.words,
      fullTranscript: diarized.fullTranscript,
      speakerCount: diarized.speakerCount,
      identification: Object.fromEntries(speakerIdentification),
    });
  } catch (err) {
    console.error("Process error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Process failed" },
      { status: 500 }
    );
  }
}
