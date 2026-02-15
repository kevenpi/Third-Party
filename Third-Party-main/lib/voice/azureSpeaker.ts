/**
 * Azure AI Speaker Recognition (Identification) - text-independent.
 * Create profile, enroll with audio, identify speaker from audio.
 * Requires: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. westus).
 */

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "westus";

const BASE_URL = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com`;

function getHeaders(): Record<string, string> {
  if (!AZURE_SPEECH_KEY) throw new Error("AZURE_SPEECH_KEY is not set");
  return {
    "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
    "Content-Type": "application/json",
  };
}

function getHeadersAudio(): Record<string, string> {
  if (!AZURE_SPEECH_KEY) throw new Error("AZURE_SPEECH_KEY is not set");
  return {
    "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
    "Content-Type": "application/octet-stream",
  };
}

/**
 * Create a new speaker identification profile (text-independent).
 * Returns profileId to use for enrollment and identification.
 */
export async function createIdentificationProfile(locale = "en-us"): Promise<{ profileId: string }> {
  const res = await fetch(
    `${BASE_URL}/speaker/identification/v2.0/text-independent/profiles`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ locale }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure create profile failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { profileId: string };
  return { profileId: data.profileId };
}

/**
 * Enroll a speaker by uploading audio to their profile.
 * Audio: WAV, 16 kHz, 16-bit, mono. At least ~30s total recommended.
 */
export async function addEnrollment(
  profileId: string,
  audioBuffer: Buffer,
  options?: { shortAudio?: boolean }
): Promise<{ enrollmentStatus: string; enrollmentLengthSec: number; speechLengthSec: number }> {
  const qs = options?.shortAudio ? "?shortAudio=true" : "";
  const res = await fetch(
    `${BASE_URL}/speaker/identification/v2.0/text-independent/profiles/${profileId}/enrollments${qs}`,
    {
      method: "POST",
      headers: getHeadersAudio(),
      body: audioBuffer as unknown as BodyInit,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure enrollment failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { enrollmentStatus: string; enrollmentLengthSec: number; speechLengthSec: number };
}

/**
 * Get profile enrollment status.
 */
export async function getProfile(profileId: string): Promise<{
  profileId: string;
  enrollmentStatus: string;
  enrollmentLengthSec: number;
  speechLengthSec: number;
}> {
  const res = await fetch(
    `${BASE_URL}/speaker/identification/v2.0/text-independent/profiles/${profileId}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure get profile failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Identify the speaker from audio against a list of profile IDs.
 * Returns identified profile ID and confidence, or null if no match above threshold.
 */
export async function identifySpeaker(
  profileIds: string[],
  audioBuffer: Buffer
): Promise<{ identifiedProfileId: string; confidence: string } | null> {
  if (profileIds.length === 0) return null;
  const qs = `?profileIds=${profileIds.join(",")}`;
  const res = await fetch(
    `${BASE_URL}/speaker/identification/v2.0/text-independent/identify${qs}`,
    {
      method: "POST",
      headers: getHeadersAudio(),
      body: audioBuffer as unknown as BodyInit,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure identify failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    identifiedProfileId?: string;
    confidence?: string;
  };
  // API returns "00000000-0000-0000-0000-000000000000" when no match
  if (!data.identifiedProfileId || data.identifiedProfileId === "00000000-0000-0000-0000-000000000000") {
    return null;
  }
  return {
    identifiedProfileId: data.identifiedProfileId,
    confidence: data.confidence ?? "0",
  };
}

/**
 * Delete a speaker profile.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/speaker/identification/v2.0/text-independent/profiles/${profileId}`,
    { method: "DELETE", headers: getHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Azure delete profile failed: ${res.status} ${text}`);
  }
}
