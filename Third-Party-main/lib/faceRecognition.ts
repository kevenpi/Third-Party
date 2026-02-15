/**
 * Face recognition: enrollment storage + OpenAI Vision identification.
 *
 * Enrollment photos are stored on disk at data/faces/{personId}/.
 * Identification uses GPT-4o Vision to compare a camera frame against
 * all enrolled reference photos.
 */

import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import type { EnrolledPerson, FaceIdentification } from "@shared/types";
import { getDataRoot } from "@/lib/runtimePaths";

const DATA_ROOT = getDataRoot();
const FACES_DIR = path.join(DATA_ROOT, "faces");
const PEOPLE_FILE = path.join(FACES_DIR, "people.json");
const UNKNOWN_DIR = path.join(FACES_DIR, "unknown");

// ---------------------------------------------------------------------------
// Cache: avoid calling OpenAI Vision on every frame
// ---------------------------------------------------------------------------

let identifyCache: { result: FaceIdentification | null; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureDirs() {
  await fs.mkdir(FACES_DIR, { recursive: true });
  await fs.mkdir(UNKNOWN_DIR, { recursive: true });
}

async function readPeople(): Promise<EnrolledPerson[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(PEOPLE_FILE, "utf8");
    return JSON.parse(raw) as EnrolledPerson[];
  } catch {
    return [];
  }
}

async function writePeople(people: EnrolledPerson[]) {
  await ensureDirs();
  await fs.writeFile(PEOPLE_FILE, JSON.stringify(people, null, 2), "utf8");
}

function personDir(personId: string): string {
  return path.join(FACES_DIR, personId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enroll a face photo for a person. Creates the person entry if it
 * doesn't exist yet, then saves the photo to data/faces/{personId}/.
 */
export async function enrollFace(
  personId: string,
  name: string,
  imageBase64: string
): Promise<EnrolledPerson> {
  const dir = personDir(personId);
  await fs.mkdir(dir, { recursive: true });

  // Save the photo
  const timestamp = Date.now();
  const photoPath = path.join(dir, `${timestamp}.jpg`);
  const buffer = Buffer.from(imageBase64, "base64");
  await fs.writeFile(photoPath, buffer);

  // Upsert person record
  const people = await readPeople();
  let person = people.find((p) => p.id === personId);
  if (person) {
    person.name = name;
    person.photoCount += 1;
  } else {
    person = {
      id: personId,
      name,
      photoCount: 1,
      createdAt: new Date().toISOString(),
    };
    people.push(person);
  }
  await writePeople(people);
  return person;
}

/** List all enrolled people. */
export async function listEnrolledPeople(): Promise<EnrolledPerson[]> {
  return readPeople();
}

/** Get a single enrolled person or null. */
export async function getEnrolledPerson(
  personId: string
): Promise<EnrolledPerson | null> {
  const people = await readPeople();
  return people.find((p) => p.id === personId) ?? null;
}

/**
 * Load all reference photos for a person as base64 strings (jpeg).
 * Returns at most 3 most-recent photos to keep the GPT-4o payload small.
 */
async function loadReferencePhotos(
  personId: string
): Promise<string[]> {
  const dir = personDir(personId);
  try {
    const files = await fs.readdir(dir);
    const jpgs = files
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .slice(-3);
    const photos: string[] = [];
    for (const file of jpgs) {
      const buf = await fs.readFile(path.join(dir, file));
      photos.push(buf.toString("base64"));
    }
    return photos;
  } catch {
    return [];
  }
}

/**
 * Identify who is in `frameBase64` by comparing against all enrolled
 * faces using GPT-4o Vision.
 *
 * Returns the match or null. Results are cached for CACHE_TTL_MS.
 */
export async function identifyFace(
  frameBase64: string
): Promise<FaceIdentification | null> {
  // Check cache
  if (identifyCache && Date.now() < identifyCache.expiresAt) {
    return identifyCache.result;
  }

  const people = await readPeople();
  if (people.length === 0) {
    identifyCache = { result: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }

  // Build multi-image message for GPT-4o Vision
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  // Add reference photos with labels
  for (const person of people) {
    const photos = await loadReferencePhotos(person.id);
    if (photos.length === 0) continue;
    content.push({
      type: "text",
      text: `Reference: this is "${person.name}" (id: ${person.id}):`,
    });
    for (const photo of photos) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${photo}`, detail: "low" },
      });
    }
  }

  // Add the query frame
  content.push({
    type: "text",
    text: "Now identify the person in this camera frame. If none of the enrolled people match, set match to null.",
  });
  content.push({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${frameBase64}`, detail: "low" },
  });

  try {
    const openai = new OpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            'You are a face recognition assistant. Compare the camera frame against the reference photos. Respond with ONLY valid JSON: { "match": "<name>" or null, "personId": "<id>" or null, "confidence": "high" | "medium" | "low" }',
        },
        { role: "user", content },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      identifyCache = { result: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      match: string | null;
      personId: string | null;
      confidence: "high" | "medium" | "low";
    };

    if (!parsed.match || !parsed.personId || parsed.confidence === "low") {
      identifyCache = { result: null, expiresAt: Date.now() + CACHE_TTL_MS };
      return null;
    }

    const result: FaceIdentification = {
      personId: parsed.personId,
      personName: parsed.match,
      confidence: parsed.confidence,
    };

    identifyCache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.error("Face identification error:", err);
    identifyCache = { result: null, expiresAt: Date.now() + CACHE_TTL_MS };
    return null;
  }
}

/** Clear the identification cache (e.g. when conversation ends). */
export function clearIdentifyCache() {
  identifyCache = null;
}

/**
 * Save an unknown face frame for later tagging.
 * Returns the saved file path.
 */
export async function saveUnknownFace(
  sessionId: string,
  frameBase64: string
): Promise<string> {
  await ensureDirs();
  const filePath = path.join(UNKNOWN_DIR, `${sessionId}_${Date.now()}.jpg`);
  await fs.writeFile(filePath, Buffer.from(frameBase64, "base64"));
  return filePath;
}

/**
 * Promote an unknown face frame to an enrolled person.
 * Moves the file from unknown/ to the person's directory and enrolls.
 */
export async function tagUnknownFace(
  unknownPath: string,
  personId: string,
  name: string
): Promise<EnrolledPerson> {
  const buf = await fs.readFile(unknownPath);
  const person = await enrollFace(personId, name, buf.toString("base64"));
  await fs.unlink(unknownPath).catch(() => {});
  return person;
}

/**
 * Update a person's lastSeenAt timestamp.
 */
export async function touchPerson(personId: string): Promise<void> {
  const people = await readPeople();
  const person = people.find((p) => p.id === personId);
  if (person) {
    person.lastSeenAt = new Date().toISOString();
    await writePeople(people);
  }
}
