/**
 * Typed error hierarchy for the Medium MCP server.
 *
 * Every operational failure is represented by a subclass of {@link AppError}
 * so tools can translate them into meaningful MCP responses with a stable
 * machine-readable `code` and an HTTP-ish severity.
 */

export type ErrorCode =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'MEDIUM_API_ERROR'
  | 'CONFIG_ERROR'
  | 'CONFLICT'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR';

/** Base class for all expected/operational errors. */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  /** Whether a caller may reasonably retry the operation. */
  public readonly retryable: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      statusCode?: number;
      retryable?: boolean;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }

  /** Serializable representation for logs and MCP payloads. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export class AuthError extends AppError {
  constructor(message = 'Authentication failed', details?: unknown) {
    super(message, { code: 'AUTH_ERROR', statusCode: 401, details });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, details });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, {
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'CONFLICT', statusCode: 409, details });
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterMs?: number;
  constructor(message = 'Rate limit exceeded', retryAfterMs?: number) {
    super(message, { code: 'RATE_LIMIT', statusCode: 429, retryable: true });
    this.retryAfterMs = retryAfterMs;
  }
}

export class MediumApiError extends AppError {
  constructor(message: string, statusCode: number, details?: unknown) {
    super(message, {
      code: 'MEDIUM_API_ERROR',
      statusCode,
      retryable: statusCode >= 500,
      details,
    });
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: 'CONFIG_ERROR', statusCode: 500, details });
  }
}

export class NetworkError extends AppError {
  constructor(message = 'Network request failed', cause?: unknown) {
    super(message, { code: 'NETWORK_ERROR', statusCode: 503, retryable: true, cause });
  }
}

/** Narrow an unknown thrown value to an {@link AppError}. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new AppError(err.message, { cause: err });
  }
  return new AppError('Unknown error', { details: err });
}
