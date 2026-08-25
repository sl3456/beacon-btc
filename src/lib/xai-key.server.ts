import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Server-only. Platform injects XAI_API_KEY; a GitHub clone can put it in `.env`.
 * Never log the value. Never import this from client components.
 */
export function xaiApiKey(): string | undefined {
  const fromEnv = process.env.XAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      if (line.slice(0, i).trim() !== "XAI_API_KEY") continue;
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      const key = v.trim();
      return key || undefined;
    }
  } catch {
    /* no .env — preview/deploy use process.env */
  }
  return undefined;
}
