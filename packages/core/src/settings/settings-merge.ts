/**
 * Deep merge utility for multi-source settings.
 *
 * Arrays are concatenated and deduplicated. Objects are deep-merged.
 * Primitive values from higher-priority sources overwrite lower ones.
 */

import type { SettingsSchema } from './settings-types.js';

/**
 * Deep merge two settings objects. `higher` takes precedence over `lower`.
 * - Arrays: concatenated and deduplicated
 * - Objects: recursively merged
 * - Primitives: higher wins
 */
export function mergeSettings(lower: SettingsSchema, higher: SettingsSchema): SettingsSchema {
  const result: SettingsSchema = { ...lower };

  for (const key of Object.keys(higher) as (keyof SettingsSchema)[]) {
    const higherVal = higher[key];
    const lowerVal = result[key];

    if (higherVal === undefined) continue;

    if (higherVal === null || lowerVal === null || lowerVal === undefined) {
      (result as any)[key] = higherVal;
      continue;
    }

    // Array concat + dedup
    if (Array.isArray(higherVal) && Array.isArray(lowerVal)) {
      (result as any)[key] = dedupArray([...lowerVal, ...higherVal]);
      continue;
    }

    // Deep merge objects
    if (isObject(higherVal) && isObject(lowerVal) && !Array.isArray(higherVal) && !Array.isArray(lowerVal)) {
      (result as any)[key] = mergeSettings(lowerVal as any, higherVal as any);
      continue;
    }

    // Primitive: higher wins
    (result as any)[key] = higherVal;
  }

  return result;
}

/**
 * Merge an array of settings in priority order (lowest first, highest last).
 */
export function mergeSettingsStack(stack: SettingsSchema[]): SettingsSchema {
  if (stack.length === 0) return {};
  return stack.reduce((acc, cur) => mergeSettings(acc, cur), {} as SettingsSchema);
}

/**
 * Deduplicate an array. Uses JSON.stringify for object comparison.
 */
function dedupArray<T>(arr: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of arr) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}
