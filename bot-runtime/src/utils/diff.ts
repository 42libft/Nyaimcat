import { BotConfig } from "../config";

type Primitive = string | number | boolean | null | undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const primitiveEqual = (a: Primitive, b: Primitive) => a === b;

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (primitiveEqual(a as Primitive, b as Primitive)) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    if (keysA.length !== keysB.length) {
      return false;
    }

    return keysA.every((key, index) => {
      const otherKey = keysB[index];

      if (key !== otherKey) {
        return false;
      }

      return deepEqual(a[key], b[key]);
    });
  }

  return false;
};

export const computeChangedSections = (
  previous: BotConfig,
  next: BotConfig
): string[] => {
  const keys = new Set<string>([
    ...Object.keys(previous ?? {}),
    ...Object.keys(next ?? {}),
  ]);

  const changed: string[] = [];

  for (const key of keys) {
    if (!deepEqual((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])) {
      changed.push(key);
    }
  }

  return changed;
};
