import { SpikeWindow } from "@shared/types";

function safeNumber(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSpikeWindow(raw: Partial<SpikeWindow>, idx: number): SpikeWindow | null {
  const startSec = typeof raw.startSec === "number" ? raw.startSec : null;
  const endSec = typeof raw.endSec === "number" ? raw.endSec : null;
  if (startSec === null || endSec === null || endSec <= startSec || startSec < 0) {
    return null;
  }

  const peak =
    typeof raw.peak === "number" && raw.peak >= 0 && raw.peak <= 1 ? raw.peak : undefined;

  return {
    id: raw.id && raw.id.length > 0 ? raw.id : `spike-${idx + 1}`,
    startSec,
    endSec,
    peak
  };
}

export function parseSpikesInput(input?: string | null): SpikeWindow[] {
  if (!input || input.trim().length === 0) {
    return [];
  }

  const trimmed = input.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.spikes)
          ? parsed.spikes
          : [];
      return rows
        .map((row: any, idx: number) =>
          normalizeSpikeWindow(
            {
              id: String(row.id ?? row.windowId ?? `spike-${idx + 1}`),
              startSec: Number(row.startSec ?? row.start ?? row.start_seconds),
              endSec: Number(row.endSec ?? row.end ?? row.end_seconds),
              peak: row.peak !== undefined ? Number(row.peak) : undefined
            },
            idx
          )
        )
        .filter((row: SpikeWindow | null): row is SpikeWindow => Boolean(row));
    } catch {
      return [];
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const hasHeader = /start/i.test(lines[0]) && /end/i.test(lines[0]);
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map((line, idx) => {
      const cols = line.split(",").map((part) => part.trim());
      const startSec = safeNumber(cols[0]);
      const endSec = safeNumber(cols[1]);
      const peak = cols[2] !== undefined ? safeNumber(cols[2]) : null;

      return normalizeSpikeWindow(
        {
          id: `spike-${idx + 1}`,
          startSec: startSec ?? undefined,
          endSec: endSec ?? undefined,
          peak: peak ?? undefined
        },
        idx
      );
    })
    .filter((row: SpikeWindow | null): row is SpikeWindow => Boolean(row));
}

export function decodeAudioDataUrl(dataUrl?: string | null): Buffer | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return null;
  }

  const [, base64Part] = dataUrl.split(",");
  if (!base64Part) {
    return null;
  }

  try {
    return Buffer.from(base64Part, "base64");
  } catch {
    return null;
  }
}
