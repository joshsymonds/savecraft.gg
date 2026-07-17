# Savecraft (historical repository)

**Development in this repository has stopped.** It remains available, unchanged,
under its original [Apache 2.0 license](LICENSE).

Savecraft's codebase split along its trust boundary in July 2026:

- **The open local client** — the daemon, WASM plugin runtime, save parsers,
  in-game mods, and installer: everything Savecraft installs on a user's
  machine — continues at
  **[joshsymonds/savecraft-client](https://github.com/joshsymonds/savecraft-client)**,
  with history, under Apache 2.0.
- **The hosted product** (API, web app, reference modules) is proprietary and
  developed privately.

Existing releases and this repository's full history stay available under
their original terms. For what the client reads and transmits, see the client
repository's README and its
[wire schema](https://github.com/joshsymonds/savecraft-client/blob/main/proto/savecraft/v1/protocol.proto).
