import { NextRequest, NextResponse } from "next/server";
import {
  createIdentificationProfile,
  addEnrollment,
  getProfile,
} from "@/lib/voice/azureSpeaker";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.AZURE_SPEECH_KEY) {
      return NextResponse.json(
        { error: "Azure Speech not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const existingProfileId = formData.get("profileId") as string | null;

    let profileId = existingProfileId?.trim() || null;

    if (!profileId) {
      const { profileId: newId } = await createIdentificationProfile(
        String(formData.get("locale") || "en-us")
      );
      profileId = newId;
    }

    if (!file) {
      return NextResponse.json(
        { error: "Missing 'audio' file", profileId },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const shortAudio = formData.get("shortAudio") === "true";
    const enrollment = await addEnrollment(profileId!, buffer, { shortAudio });

    const profile = await getProfile(profileId!);

    return NextResponse.json({
      profileId,
      enrollmentStatus: profile.enrollmentStatus,
      enrollmentLengthSec: profile.enrollmentLengthSec,
      speechLengthSec: profile.speechLengthSec,
      enrollment,
    });
  } catch (err) {
    console.error("Enroll error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrollment failed" },
      { status: 500 }
    );
  }
}
