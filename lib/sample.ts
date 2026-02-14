import { promises as fs } from "fs";
import path from "path";

const SAMPLE_DIR = path.join(process.cwd(), "sample_day");

export async function loadSampleTranscript(): Promise<string> {
  const filePath = path.join(SAMPLE_DIR, "sample_transcript.txt");
  return fs.readFile(filePath, "utf8");
}

export async function loadSampleSpikesText(): Promise<string> {
  const filePath = path.join(SAMPLE_DIR, "sample_spikes.json");
  return fs.readFile(filePath, "utf8");
}

export async function loadSamplePartnerReview(): Promise<string> {
  const filePath = path.join(SAMPLE_DIR, "sample_partner_review.json");
  return fs.readFile(filePath, "utf8");
}
