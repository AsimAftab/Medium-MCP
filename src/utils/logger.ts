/**
 * Structured logger writing JSON lines to stderr.
 *
 * MCP servers communicate over stdio, so *nothing* may be written to stdout
 * except protocol frames. All diagnostics therefore go to stderr.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface LoggerOptions {
  level: LogLevel;
  verbose?: boolean;
  /** Static fields merged into every record (e.g. service name). */
  base?: Record<string, unknown>;
}

export interface LogFields {
  [key: string]: unknown;
}

let counter = 0;

/** Generate a short, monotonic request id for correlating tool calls. */
export function newRequestId(): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `req_${counter.toString(36)}${rand}`;
}

export class Logger {
  private level: LogLevel;
  private verbose: boolean;
  private base: Record<string, unknown>;

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.verbose = options.verbose ?? false;
    this.base = options.base ?? {};
  }

  /** Return a child logger with additional bound fields. */
  child(fields: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      verbose: this.verbose,
      base: { ...this.base, ...fields },
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...this.base,
      ...fields,
    };
    process.stderr.write(`${JSON.stringify(record)}\n`);
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    if (!this.verbose && this.level !== 'debug') return;
    this.write('debug', message, fields);
  }

  /** Time an async operation, logging its duration at debug level. */
  async time<T>(label: string, fn: () => Promise<T>, fields?: LogFields): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.debug(`${label} completed`, { ...fields, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      this.error(`${label} failed`, {
        ...fields,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
