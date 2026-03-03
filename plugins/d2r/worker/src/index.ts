import referenceModule from "../reference.wasm";

import { executeWasm } from "./wasi-shim";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const query = await request.text();
    const result = executeWasm(referenceModule, query);

    return new Response(result.stdout, {
      status: result.exitCode === 0 ? 200 : 422,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  },
};
