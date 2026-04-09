/**
 * PoE pob_calc — native reference module.
 *
 * Calls the headless Path of Building calc service (pob-server) running
 * on ultraviolet behind a Cloudflare tunnel. Accepts a PoB build code
 * and returns structured DPS, defence, skill, item, and tree data.
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

/** Timeout for PoB calc requests (ms). */
const POB_TIMEOUT_MS = 30_000;

export const pobCalcModule: NativeReferenceModule = {
  id: "pob_calc",
  name: "PoB Build Calculator",
  description:
    "Run a Path of Building build code through the PoB calc engine. Returns structured DPS, defence, resistance, skill, item, and passive tree data. Use when the player shares a PoB build code (a long base64 string) and wants analysis, optimization advice, or comparison.",
  parameters: {
    build_code: {
      type: "string",
      description:
        "PoB build code — the base64 string players share (e.g. from pastebin, discord, reddit). This is NOT an XML document; it is the compressed export code from Path of Building.",
    },
  },

  async execute(query: Record<string, unknown>, env: Env): Promise<ReferenceResult> {
    const buildCode = query.build_code as string | undefined;
    if (!buildCode) {
      return { type: "text", content: "Error: build_code is required." };
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
      response = await fetch(`${pobUrl}/calc`, {
        method: "POST",
        headers,
        body: JSON.stringify({ buildCode }),
        signal: AbortSignal.timeout(POB_TIMEOUT_MS),
      });
    } catch {
      return {
        type: "text",
        content:
          "PoB calc service is currently unavailable. The build code was valid but the calculation server could not be reached. Try again later.",
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        type: "text",
        content: `PoB calc service returned an error (${String(response.status)}): ${body}`,
      };
    }

    const data = (await response.json()) as { type?: string; message?: string };

    if (data.type === "error") {
      return {
        type: "text",
        content: `PoB calc error: ${data.message ?? "unknown error"}`,
      };
    }

    return { type: "structured", data: data as Record<string, unknown> };
  },
};
