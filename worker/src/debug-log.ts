export type DebugLogLevel = "debug" | "info" | "warn" | "error";

export interface DebugLogEntry {
  ts: number;
  level: DebugLogLevel;
  msg: string;
  ctx?: Record<string, unknown>;
}

export interface DebugLogFilterOptions {
  level?: DebugLogLevel;
  limit?: number;
}

const DEFAULT_MAX_SIZE = 200;

export type LogOutput = (json: string) => void;

export class DebugLog {
  private items: DebugLogEntry[] = [];
  private readonly maxSize: number;
  private readonly output: LogOutput;

  constructor(maxSize: number = DEFAULT_MAX_SIZE, output: LogOutput = console.log) {
    this.maxSize = maxSize;
    this.output = output;
  }

  push(level: DebugLogLevel, msg: string, ctx?: Record<string, unknown>): void {
    const entry: DebugLogEntry = { ts: Date.now(), level, msg, ...(ctx && { ctx }) };
    this.items.push(entry);
    if (this.items.length > this.maxSize) {
      this.items.shift();
    }
    this.output(JSON.stringify(entry));
  }

  entries(options?: DebugLogFilterOptions): DebugLogEntry[] {
    let result = [...this.items].reverse();
    if (options?.level) {
      result = result.filter((entry) => entry.level === options.level);
    }
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    return result;
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}
