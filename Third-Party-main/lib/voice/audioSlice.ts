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

/** Segment with start/end in ms and string speaker (OpenAI diarization). */
export type SegmentMs = { speaker: string; start_ms: number; end_ms: number };

/**
 * Extract per-speaker audio from buffer using segments with start_ms/end_ms.
 * Returns one concatenated buffer per local speaker label.
 */
export function extractSpeakerBuffersBySegmentMs(
  buffer: Buffer,
  segments: SegmentMs[],
  sampleRateHz: number = 16000
): Map<string, Buffer> {
  const bySpeaker = new Map<string, Buffer[]>();
  for (const seg of segments) {
    const startSec = seg.start_ms / 1000;
    const endSec = seg.end_ms / 1000;
    if (endSec <= startSec) continue;
    const chunk = sliceAudioByTimeRange(buffer, startSec, endSec, sampleRateHz);
    if (chunk.length < 1600) continue; // <0.05s
    const list = bySpeaker.get(seg.speaker) ?? [];
    list.push(chunk);
    bySpeaker.set(seg.speaker, list);
  }
  const out = new Map<string, Buffer>();
  for (const [speaker, chunks] of bySpeaker) {
    out.set(speaker, Buffer.concat(chunks));
  }
  return out;
}
