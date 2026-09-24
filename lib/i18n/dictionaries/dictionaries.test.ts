import { describe, it, expect } from "vitest";
import { en } from "./en";
import { es } from "./es";

// TypeScript already rejects an `es` that is missing a key `en` has. It does
// not reject the reverse, an empty string, or a placeholder one language spells
// differently, and a missing label renders as nothing, silently. These are the
// drifts it lets through.

function flatten(value: unknown, path = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      for (const [childPath, leaf] of flatten(child, path ? `${path}.${key}` : key)) out.set(childPath, leaf);
    }
  } else {
    out.set(path, value);
  }
  return out;
}

const english = flatten(en);
const spanish = flatten(es);

const placeholders = (text: unknown) =>
  typeof text === "string" ? [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort() : [];

describe("dictionaries", () => {
  it("define the same keys in both languages", () => {
    const onlyEnglish = [...english.keys()].filter((key) => !spanish.has(key));
    const onlySpanish = [...spanish.keys()].filter((key) => !english.has(key));
    expect({ onlyEnglish, onlySpanish }).toEqual({ onlyEnglish: [], onlySpanish: [] });
  });

  it("have no empty strings", () => {
    const empty = [...english, ...spanish]
      .filter(([, value]) => typeof value === "string" && value.trim() === "")
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("use the same {placeholders} in both languages", () => {
    const mismatched = [...english.keys()]
      .filter((key) => spanish.has(key))
      .filter((key) => placeholders(english.get(key)).join() !== placeholders(spanish.get(key)).join());
    expect(mismatched).toEqual([]);
  });
});
