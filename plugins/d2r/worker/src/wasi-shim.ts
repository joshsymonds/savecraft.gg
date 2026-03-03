/**
 * Minimal WASI Preview 1 shim for executing reference WASM plugins.
 *
 * Provides stdin/stdout/stderr and the handful of runtime functions
 * that Go, Rust, and Zig WASI binaries need at startup. Everything
 * else returns ERRNO_NOSYS via a Proxy fallback.
 *
 * No filesystem, no network, no preopens — just computation.
 */

const ERRNO_SUCCESS = 0;
const ERRNO_BADF = 8;
const ERRNO_NOSYS = 52;

const FILETYPE_CHARACTER_DEVICE = 2;

/** Thrown by proc_exit to unwind the WASM stack. */
class WasiExit {
  constructor(public readonly code: number) {}
}

export interface WasmResult {
  /** Captured stdout as a string. */
  stdout: string;
  /** The exit code from proc_exit (0 = success). */
  exitCode: number;
}

/**
 * Execute a pre-compiled WASI Preview 1 module with JSON on stdin, capturing stdout.
 *
 * @param module - Pre-compiled WebAssembly module
 * @param stdin  - String to feed as stdin (typically a JSON query)
 * @returns Captured stdout and exit code
 */
export function executeWasm(module: WebAssembly.Module, stdin: string): WasmResult {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // stdin buffer: pre-loaded, consumed sequentially
  const stdinBuf = encoder.encode(stdin);
  let stdinOffset = 0;

  // stdout buffer: chunks collected, concatenated at the end
  const stdoutChunks: Uint8Array[] = [];

  let memory: WebAssembly.Memory;

  function view(): DataView {
    return new DataView(memory.buffer);
  }

  // -- WASI function implementations --

  function args_sizes_get(argcPtr: number, argvBufSizePtr: number): number {
    view().setUint32(argcPtr, 0, true);
    view().setUint32(argvBufSizePtr, 0, true);
    return ERRNO_SUCCESS;
  }

  function args_get(): number {
    return ERRNO_SUCCESS;
  }

  function environ_sizes_get(environcPtr: number, environBufSizePtr: number): number {
    view().setUint32(environcPtr, 0, true);
    view().setUint32(environBufSizePtr, 0, true);
    return ERRNO_SUCCESS;
  }

  function environ_get(): number {
    return ERRNO_SUCCESS;
  }

  function clock_time_get(_id: number, _precision: bigint, timePtr: number): number {
    view().setBigUint64(timePtr, BigInt(Date.now()) * 1_000_000n, true);
    return ERRNO_SUCCESS;
  }

  function random_get(bufPtr: number, bufLen: number): number {
    const buf = new Uint8Array(memory.buffer, bufPtr, bufLen);
    crypto.getRandomValues(buf);
    return ERRNO_SUCCESS;
  }

  function fd_read(fd: number, iovsPtr: number, iovsLen: number, nreadPtr: number): number {
    if (fd !== 0) {
      view().setUint32(nreadPtr, 0, true);
      return ERRNO_BADF;
    }

    const dv = view();
    let totalRead = 0;

    for (let i = 0; i < iovsLen; i++) {
      const ptr = dv.getUint32(iovsPtr + i * 8, true);
      const len = dv.getUint32(iovsPtr + i * 8 + 4, true);
      const remaining = stdinBuf.length - stdinOffset;
      const toRead = Math.min(len, remaining);

      if (toRead > 0) {
        new Uint8Array(memory.buffer, ptr, toRead).set(
          stdinBuf.subarray(stdinOffset, stdinOffset + toRead),
        );
        stdinOffset += toRead;
        totalRead += toRead;
      }

      if (stdinOffset >= stdinBuf.length) break;
    }

    dv.setUint32(nreadPtr, totalRead, true);
    return ERRNO_SUCCESS;
  }

  function fd_write(fd: number, iovsPtr: number, iovsLen: number, nwrittenPtr: number): number {
    const dv = view();
    let totalWritten = 0;

    for (let i = 0; i < iovsLen; i++) {
      const ptr = dv.getUint32(iovsPtr + i * 8, true);
      const len = dv.getUint32(iovsPtr + i * 8 + 4, true);

      if (fd === 1) {
        // stdout — capture
        stdoutChunks.push(new Uint8Array(memory.buffer.slice(ptr, ptr + len)));
      }
      // fd 2 (stderr) is silently discarded

      totalWritten += len;
    }

    dv.setUint32(nwrittenPtr, totalWritten, true);
    return ERRNO_SUCCESS;
  }

  function fd_fdstat_get(fd: number, fdstatPtr: number): number {
    if (fd > 2) return ERRNO_BADF;
    const dv = view();
    // filetype: character device
    dv.setUint8(fdstatPtr, FILETYPE_CHARACTER_DEVICE);
    // fdflags: 0
    dv.setUint16(fdstatPtr + 2, 0, true);
    // rights_base: all
    dv.setBigUint64(fdstatPtr + 8, 0xffffffffffffffffn, true);
    // rights_inheriting: all
    dv.setBigUint64(fdstatPtr + 16, 0xffffffffffffffffn, true);
    return ERRNO_SUCCESS;
  }

  function fd_prestat_get(): number {
    return ERRNO_BADF; // no preopens
  }

  function fd_prestat_dir_name(): number {
    return ERRNO_BADF;
  }

  function fd_close(): number {
    return ERRNO_SUCCESS;
  }

  function fd_seek(_fd: number, _offset: bigint, _whence: number, offsetPtr: number): number {
    view().setBigUint64(offsetPtr, 0n, true);
    return ERRNO_NOSYS;
  }

  function proc_exit(code: number): void {
    throw new WasiExit(code);
  }

  function sched_yield(): number {
    return ERRNO_SUCCESS;
  }

  // Implementations for functions that real runtimes call
  const implementations: Record<string, (...args: number[]) => number | void> = {
    args_sizes_get,
    args_get,
    environ_sizes_get,
    environ_get,
    clock_time_get: clock_time_get as unknown as (...args: number[]) => number,
    random_get,
    fd_read,
    fd_write,
    fd_fdstat_get,
    fd_prestat_get,
    fd_prestat_dir_name,
    fd_close,
    fd_seek: fd_seek as unknown as (...args: number[]) => number,
    proc_exit: proc_exit as unknown as (...args: number[]) => void,
    sched_yield,
  };

  // Proxy: any unimplemented WASI function returns ERRNO_NOSYS
  const wasiImport = new Proxy(implementations, {
    get(target, prop) {
      if (typeof prop === "string" && prop in target) {
        return target[prop];
      }
      return () => ERRNO_NOSYS;
    },
  });

  try {
    const instance = new WebAssembly.Instance(module, {
      wasi_snapshot_preview1: wasiImport,
    });
    memory = instance.exports.memory as WebAssembly.Memory;
    (instance.exports._start as () => void)();

    // If _start returns without calling proc_exit
    return { stdout: concatAndDecode(stdoutChunks, decoder), exitCode: 0 };
  } catch (e) {
    if (e instanceof WasiExit) {
      return { stdout: concatAndDecode(stdoutChunks, decoder), exitCode: e.code };
    }
    throw e;
  }
}

function concatAndDecode(chunks: Uint8Array[], decoder: TextDecoder): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return decoder.decode(chunks[0]);

  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return decoder.decode(result);
}
