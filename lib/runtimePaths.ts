import path from "path";

/**
 * Writable runtime data root.
 * - Local dev: <repo>/data
 * - Vercel serverless: /tmp/thirdparty-data
 */
export function getDataRoot(): string {
  if (process.env.VERCEL) {
    return path.join("/tmp", "thirdparty-data");
  }
  return path.join(process.cwd(), "data");
}
