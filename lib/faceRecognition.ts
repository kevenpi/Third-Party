/**
 * Face recognition: enrollment storage + OpenAI Vision identification.
 *
 * Enrollment photos are stored on disk at data/faces/{personId}/.
 * Identification compares camera frames against enrolled references.
 */

import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import type { EnrolledPerson, FaceIdentification } from "@shared/types";
import { getDataRoot } from "@/lib/runtimePaths";
import { getOpenAIApiKey } from "@/lib/openaiKey";

const DATA_ROOT = getDataRoot();
const FACES_DIR = path.join(DATA_ROOT, "faces");
const PEOPLE_FILE = path.join(FACES_DIR, "people.json");
const UNKNOWN_DIR = path.join(FACES_DIR, "unknown");

type IdentifyCacheEntry = {
  result: FaceIdentifyResult;
  expiresAt: number;
};

export interface FaceIdentifyResult {
  person: FaceIdentification | null;
  uncertainCandidate: FaceIdentification | null;
  noEnrolledFaces: boolean;
  /** Diagnostic reason when person is null */
  reason?: "no_api_key" | "no_enrolled" | "api_error" | "no_parse" | "no_match";
  /** How many people have enrolled photos */
  enrolledCount?: number;
  /** Detail for api_error/no_parse troubleshooting */
  errorDetail?: string;
}

const identifyCache = new Map<string, IdentifyCacheEntry>();
const STRONG_CACHE_TTL_MS = 8_000;
const UNCERTAIN_CACHE_TTL_MS = 4_000;
const MISS_CACHE_TTL_MS = 1_500;

async function ensureDirs() {
  await fs.mkdir(FACES_DIR, { recursive: true });
  await fs.mkdir(UNKNOWN_DIR, { recursive: true });
}

function toPosixRel(absPath: string): string {
  return path.relative(DATA_ROOT, absPath).replaceAll("\\", "/");
}

function resolveDataPath(storedPath: string): string {
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.join(DATA_ROOT, storedPath.replace(/^\/+/, ""));
}

function isInsideDir(targetAbs: string, dirAbs: string): boolean {
  const target = path.resolve(targetAbs);
  const dir = path.resolve(dirAbs);
  return target === dir || target.startsWith(`${dir}${path.sep}`);
}

async function readPeople(): Promise<EnrolledPerson[]> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(PEOPLE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as EnrolledPerson[]) : [];
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

function detectContentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function listPersonPhotoFiles(personId: string): Promise<string[]> {
  const dir = personDir(personId);
  try {
    const entries = await fs.readdir(dir);
    const images = entries.filter((entry) => /\.(jpg|jpeg|png|webp)$/i.test(entry));
    const withStats = await Promise.all(
      images.map(async (file) => {
        const abs = path.join(dir, file);
        const st = await fs.stat(abs);
        return { abs, mtime: st.mtimeMs };
      })
    );
    return withStats.sort((a, b) => b.mtime - a.mtime).map((entry) => entry.abs);
  } catch {
    return [];
  }
}

async function resolvePersonAvatarAbsolute(person: EnrolledPerson): Promise<string | null> {
  if (person.avatarPath) {
    const avatarAbs = resolveDataPath(person.avatarPath);
    try {
      const st = await fs.stat(avatarAbs);
      if (st.isFile()) return avatarAbs;
    } catch {
      // Fall through to latest face photo.
    }
  }

  const photos = await listPersonPhotoFiles(person.id);
  return photos[0] ?? null;
}

/**
 * Load reference photos as base64 strings.
 * We prefer avatar + recent enrollments and cap total to keep payload small.
 */
async function loadReferencePhotos(person: EnrolledPerson): Promise<string[]> {
  const seen = new Set<string>();
  const paths: string[] = [];

  const avatarAbs = await resolvePersonAvatarAbsolute(person);
  if (avatarAbs) {
    paths.push(avatarAbs);
    seen.add(path.resolve(avatarAbs));
  }

  const recent = await listPersonPhotoFiles(person.id);
  for (const photoPath of recent) {
    const key = path.resolve(photoPath);
    if (seen.has(key)) continue;
    paths.push(photoPath);
    seen.add(key);
    if (paths.length >= 4) break;
  }

  const out: string[] = [];
  for (const abs of paths.slice(0, 4)) {
    try {
      const buf = await fs.readFile(abs);
      out.push(buf.toString("base64"));
    } catch {
      // Ignore bad file.
    }
  }

  return out;
}

function frameFingerprint(frameBase64: string): string {
  return createHash("sha1").update(frameBase64).digest("hex");
}

function cacheIdentifyResult(frameHash: string, result: FaceIdentifyResult) {
  const ttl =
    result.person
      ? STRONG_CACHE_TTL_MS
      : result.uncertainCandidate
        ? UNCERTAIN_CACHE_TTL_MS
        : MISS_CACHE_TTL_MS;

  identifyCache.set(frameHash, {
    result,
    expiresAt: Date.now() + ttl,
  });

  if (identifyCache.size > 64) {
    const now = Date.now();
    for (const [key, entry] of identifyCache.entries()) {
      if (entry.expiresAt <= now) identifyCache.delete(key);
    }
  }
}

function findJsonObject(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function candidateFromModel(
  peopleById: Map<string, EnrolledPerson>,
  peopleByName: Map<string, EnrolledPerson>,
  personId: string | null | undefined,
  name: string | null | undefined,
  confidence: "high" | "medium" | "low"
): FaceIdentification | null {
  const id = personId?.trim();
  const nm = name?.trim();

  if (id && peopleById.has(id)) {
    const p = peopleById.get(id)!;
    return {
      personId: p.id,
      personName: p.name,
      confidence,
    };
  }

  if (nm) {
    const p = peopleByName.get(nm.toLowerCase());
    if (p) {
      return {
        personId: p.id,
        personName: p.name,
        confidence,
      };
    }
  }

  return null;
}

/**
 * Enroll a face photo for a person and refresh their avatar pointer.
 */
export async function enrollFace(
  personId: string,
  name: string,
  imageBase64: string,
  options?: { setAsAvatar?: boolean }
): Promise<EnrolledPerson> {
  const dir = personDir(personId);
  await fs.mkdir(dir, { recursive: true });

  const timestamp = Date.now();
  const photoPath = path.join(dir, `${timestamp}.jpg`);
  const buffer = Buffer.from(imageBase64, "base64");
  await fs.writeFile(photoPath, buffer);

  const nowIso = new Date().toISOString();
  const photoRel = toPosixRel(photoPath);
  const shouldSetAvatar = options?.setAsAvatar ?? true;

  const people = await readPeople();
  let person = people.find((p) => p.id === personId);

  if (person) {
    person.name = name;
    person.photoCount += 1;
    if (shouldSetAvatar || !person.avatarPath) {
      person.avatarPath = photoRel;
      person.avatarUpdatedAt = nowIso;
    }
  } else {
    person = {
      id: personId,
      name,
      photoCount: 1,
      createdAt: nowIso,
      avatarPath: photoRel,
      avatarUpdatedAt: nowIso,
    };
    people.push(person);
  }

  await writePeople(people);
  clearIdentifyCache();
  return person;
}

export async function listEnrolledPeople(): Promise<EnrolledPerson[]> {
  return readPeople();
}

export async function getEnrolledPerson(personId: string): Promise<EnrolledPerson | null> {
  const people = await readPeople();
  return people.find((p) => p.id === personId) ?? null;
}

export async function getPersonAvatar(
  personId: string
): Promise<{ buffer: Buffer; contentType: string; absolutePath: string } | null> {
  const person = await getEnrolledPerson(personId);
  if (!person) return null;

  const avatarAbs = await resolvePersonAvatarAbsolute(person);
  if (!avatarAbs) return null;

  try {
    const buffer = await fs.readFile(avatarAbs);
    return {
      buffer,
      contentType: detectContentTypeFromPath(avatarAbs),
      absolutePath: avatarAbs,
    };
  } catch {
    return null;
  }
}

/**
 * Identify a face from a camera frame.
 * `person` is only returned when certainty is high.
 * `uncertainCandidate` is returned for medium/low certainty so UI can ask for confirmation.
 */
export async function identifyFace(frameBase64: string): Promise<FaceIdentifyResult> {
  const frameHash = frameFingerprint(frameBase64);
  const cached = identifyCache.get(frameHash);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  const people = await readPeople();
  const peopleWithPhotos: Array<{ person: EnrolledPerson; refs: string[] }> = [];

  for (const person of people) {
    const refs = await loadReferencePhotos(person);
    if (refs.length > 0) {
      peopleWithPhotos.push({ person, refs });
    }
  }

  if (peopleWithPhotos.length === 0) {
    const result: FaceIdentifyResult = {
      person: null,
      uncertainCandidate: null,
      noEnrolledFaces: true,
      reason: "no_enrolled",
      enrolledCount: 0,
    };
    cacheIdentifyResult(frameHash, result);
    return result;
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    const result: FaceIdentifyResult = {
      person: null,
      uncertainCandidate: null,
      noEnrolledFaces: false,
      reason: "no_api_key",
      enrolledCount: peopleWithPhotos.length,
    };
    cacheIdentifyResult(frameHash, result);
    return result;
  }

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  for (const { person, refs } of peopleWithPhotos) {
    content.push({
      type: "text",
      text: `Reference person: \"${person.name}\" (id: ${person.id}).`,
    });
    for (const photo of refs) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${photo}`, detail: "low" },
      });
    }
  }

  content.push({
    type: "text",
    text:
      "Now inspect this camera frame and decide if it matches one enrolled person. Output only JSON with this exact shape: { \"matchPersonId\": string|null, \"matchName\": string|null, \"certainty\": \"high\"|\"medium\"|\"low\"|\"none\", \"bestGuessPersonId\": string|null, \"bestGuessName\": string|null }",
  });
  content.push({
    type: "image_url",
    image_url: { url: `data:image/jpeg;base64,${frameBase64}`, detail: "low" },
  });

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 180,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a strict face-matching assistant. Compare the query frame only against provided references. Return valid JSON only.",
        },
        { role: "user", content },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    const jsonText = findJsonObject(text);
    if (!jsonText) {
      console.warn("Face ID: GPT-4o returned non-JSON:", text.slice(0, 200));
      const miss: FaceIdentifyResult = {
        person: null,
        uncertainCandidate: null,
        noEnrolledFaces: false,
        reason: "no_parse",
        enrolledCount: peopleWithPhotos.length,
      };
      cacheIdentifyResult(frameHash, miss);
      return miss;
    }

    const parsed = JSON.parse(jsonText) as {
      matchPersonId?: string | null;
      matchName?: string | null;
      certainty?: "high" | "medium" | "low" | "none";
      bestGuessPersonId?: string | null;
      bestGuessName?: string | null;
    };

    const byId = new Map(peopleWithPhotos.map(({ person }) => [person.id, person]));
    const byName = new Map(
      peopleWithPhotos.map(({ person }) => [person.name.toLowerCase(), person])
    );

    const certainty = parsed.certainty ?? "none";

    if (certainty === "high") {
      const strongMatch = candidateFromModel(
        byId,
        byName,
        parsed.matchPersonId,
        parsed.matchName,
        "high"
      );
      if (strongMatch) {
        const strongResult: FaceIdentifyResult = {
          person: strongMatch,
          uncertainCandidate: null,
          noEnrolledFaces: false,
          enrolledCount: peopleWithPhotos.length,
        };
        cacheIdentifyResult(frameHash, strongResult);
        return strongResult;
      }
    }

    let uncertain: FaceIdentification | null = null;
    if (certainty === "medium") {
      uncertain = candidateFromModel(
        byId,
        byName,
        parsed.matchPersonId,
        parsed.matchName,
        "medium"
      );
    } else if (certainty === "low") {
      uncertain =
        candidateFromModel(
          byId,
          byName,
          parsed.bestGuessPersonId,
          parsed.bestGuessName,
          "low"
        ) ??
        candidateFromModel(byId, byName, parsed.matchPersonId, parsed.matchName, "low");
    }

    const uncertainResult: FaceIdentifyResult = {
      person: null,
      uncertainCandidate: uncertain,
      noEnrolledFaces: false,
      reason: "no_match",
      enrolledCount: peopleWithPhotos.length,
    };
    cacheIdentifyResult(frameHash, uncertainResult);
    return uncertainResult;
  } catch (err) {
    const e = err as {
      message?: string;
      status?: number;
      code?: string;
      type?: string;
      error?: { message?: string; code?: string; type?: string };
    };
    const detailParts = [
      e?.message,
      e?.error?.message,
      e?.code ? `code=${e.code}` : undefined,
      e?.error?.code ? `code=${e.error.code}` : undefined,
      e?.type ? `type=${e.type}` : undefined,
      e?.error?.type ? `type=${e.error.type}` : undefined,
      typeof e?.status === "number" ? `status=${e.status}` : undefined,
    ].filter(Boolean) as string[];
    const errorDetail = detailParts.join(" | ").slice(0, 240) || "Unknown API error";
    console.error("Face identification error:", errorDetail);
    const miss: FaceIdentifyResult = {
      person: null,
      uncertainCandidate: null,
      noEnrolledFaces: false,
      reason: "api_error",
      enrolledCount: peopleWithPhotos.length,
      errorDetail,
    };
    cacheIdentifyResult(frameHash, miss);
    return miss;
  }
}

export function clearIdentifyCache() {
  identifyCache.clear();
}

/**
 * Save an unknown face frame for later tagging.
 * Returns a DATA_ROOT-relative path.
 */
export async function saveUnknownFace(sessionId: string, frameBase64: string): Promise<string> {
  await ensureDirs();
  const filePath = path.join(UNKNOWN_DIR, `${sessionId}_${Date.now()}.jpg`);
  await fs.writeFile(filePath, Buffer.from(frameBase64, "base64"));
  return toPosixRel(filePath);
}

/**
 * Promote an unknown face frame to an enrolled person.
 */
export async function tagUnknownFace(
  unknownPath: string,
  personId: string,
  name: string
): Promise<EnrolledPerson> {
  const absoluteUnknown = resolveDataPath(unknownPath);
  if (!isInsideDir(absoluteUnknown, UNKNOWN_DIR)) {
    throw new Error("Invalid unknown face path");
  }

  const buf = await fs.readFile(absoluteUnknown);
  const person = await enrollFace(personId, name, buf.toString("base64"), {
    setAsAvatar: true,
  });
  await fs.unlink(absoluteUnknown).catch(() => {});
  return person;
}

export async function touchPerson(personId: string): Promise<void> {
  const people = await readPeople();
  const person = people.find((p) => p.id === personId);
  if (!person) return;
  person.lastSeenAt = new Date().toISOString();
  await writePeople(people);
}
