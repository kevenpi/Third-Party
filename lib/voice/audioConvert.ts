/**
 * Convert arbitrary audio (webm, mp3, etc.) to WAV 16kHz mono for pipeline and embedder.
 * Uses ffmpeg when available; otherwise returns null so caller can skip conversion.
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string;
    if (p && typeof p === "string") return p;
  } catch {
    /* optional */
  }
  return "ffmpeg";
}

const TARGET_SR = 16000;
const TARGET_CH = 1;

/** Returns true if buffer looks like WAV and we can parse sample rate (optional fast path). */
function looksLikeWav(buffer: Buffer): boolean {
  return buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
}

/**
 * Convert audio buffer to WAV 16kHz mono. Returns converted buffer or null on failure.
 * Caller should use original buffer for transcription if conversion fails.
 */
export async function toWav16kMono(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length < 100) return null;

  const tmpDir = path.join(process.cwd(), "data", "voice", "tmp");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const ext = looksLikeWav(buffer) ? ".wav" : ".webm";
  const inputPath = path.join(tmpDir, `in_${Date.now()}${ext}`);
  const outputPath = path.join(tmpDir, `out_${Date.now()}.wav`);

  try {
    fs.writeFileSync(inputPath, buffer);
    await execFileAsync(getFfmpegPath(), [
      "-y",
      "-i", inputPath,
      "-ar", String(TARGET_SR),
      "-ac", String(TARGET_CH),
      "-f", "wav",
      outputPath,
    ], { timeout: 60000 });
    const out = fs.readFileSync(outputPath);
    return out;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Audio conversion failed (install ffmpeg for best results):", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
  }
}
