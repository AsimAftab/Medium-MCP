import { randomUUID } from 'node:crypto';

/** Generate a stable unique identifier for local entities. */
export function newId(prefix = ''): string {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/** Current ISO-8601 timestamp. */
export function nowIso(): string {
  return new Date().toISOString();
}
