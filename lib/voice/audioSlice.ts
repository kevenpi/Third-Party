/**
 * Slice raw PCM audio buffer by time range (seconds).
 * Assumes 16-bit mono PCM, so 2 bytes per sample, sampleRate samples per second.
 */
export function sliceAudioByTimeRange(
  buffer: Buffer,
  startSec: number,
  endSec: number,
  sampleRateHz: number = 16000
): Buffer {
  const bytesPerSample = 2;
  const startByte = Math.max(0, Math.floor(startSec * sampleRateHz) * bytesPerSample);
  const endByte = Math.min(buffer.length, Math.ceil(endSec * sampleRateHz) * bytesPerSample);
  return buffer.subarray(startByte, endByte);
}

/**
 * Extract per-speaker audio from full buffer using diarized segments.
 * Returns one concatenated buffer per speaker (for sending to Azure identify).
 */
export function extractSpeakerAudioBuffers(
  buffer: Buffer,
  segments: { speakerTag: number; startOffsetSeconds?: number; endOffsetSeconds?: number }[],
  sampleRateHz: number = 16000
): Map<number, Buffer> {
  const bySpeaker = new Map<number, Buffer[]>();

  for (const seg of segments) {
    const start = seg.startOffsetSeconds ?? 0;
    const end = seg.endOffsetSeconds ?? start + 1;
    if (end <= start) continue;
    const chunk = sliceAudioByTimeRange(buffer, start, end, sampleRateHz);
    if (chunk.length < 3200) continue; // skip very short (<0.1s) chunks
    const list = bySpeaker.get(seg.speakerTag) ?? [];
    list.push(chunk);
    bySpeaker.set(seg.speakerTag, list);
  }

  const out = new Map<number, Buffer>();
  for (const [tag, chunks] of bySpeaker) {
    out.set(tag, Buffer.concat(chunks));
  }
  return out;
}
