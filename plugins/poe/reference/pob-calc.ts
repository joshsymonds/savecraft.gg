/**
 * PoE pob_calc — native reference module.
 *
 * Calls the headless Path of Building calc service (pob-server) running
 * on ultraviolet behind a Cloudflare tunnel. Accepts a URL to a PoB build
 * (pobb.in, pastebin, pob.savecraft.gg, etc.) and returns structured DPS,
 * defence, skill, item, and tree data.
 *
 * The PoB service is external to the Worker — this module bridges it
 * into the reference module system so it's discoverable through
 * list_games / query_reference like all other reference modules.
 */

import type { Env } from "../../../worker/src/types";
import type {
  NativeReferenceModule,
  ReferenceResult,
} from "../../../worker/src/reference/types";

/** Timeout for PoB resolve requests (ms). */
const POB_TIMEOUT_MS = 30_000;

/** Minimal URL validation — must have a scheme and host. */
function isURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export const pobCalcModule: NativeReferenceModule = {
  id: "pob_calc",
  name: "PoB Build Calculator",
  description:
    "Analyze a Path of Building build from a URL. Accepts pobb.in, pastebin.com, pob.savecraft.gg, or any link containing a PoB build code. Returns structured DPS, defence, resistance, skill, item, and passive tree data. Use when the player shares a build link and wants analysis, optimization advice, or comparison.",
  parameters: {
    build: {
      type: "string",
      description:
        "URL to a PoB build — a pobb.in link, pastebin link, or any URL hosting a PoB build code. Do NOT pass raw base64 build codes; paste the link the player shared.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const build = query.build as string | undefined;
    if (!build) {
      return { type: "text", content: "Error: build is required. Pass a URL to a PoB build (e.g. a pobb.in link)." };
    }

    if (!isURL(build)) {
      return {
        type: "text",
        content:
          "Error: build must be a URL (e.g. https://pobb.in/abc123). Raw base64 build codes are not accepted — ask the player for a link instead.",
      };
    }

    const pobUrl = env.POB_URL;
    if (!pobUrl) {
      return {
        type: "text",
        content:
          "PoB calc service is not configured. The POB_URL environment variable is not set.",
      };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.POB_API_KEY) {
      headers.Authorization = `Bearer ${env.POB_API_KEY}`;
    }

    let response: Response;
    try {
      response = await fetch(`${pobUrl}/resolve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: build }),
        signal: AbortSignal.timeout(POB_TIMEOUT_MS),
      });
    } catch {
      return {
        type: "text",
        content:
          "PoB calc service is currently unavailable. The build URL was valid but the calculation server could not be reached. Try again later.",
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        type: "text",
        content: `PoB calc service returned an error (${String(response.status)}): ${body}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    return { type: "structured", data };
  },
};
