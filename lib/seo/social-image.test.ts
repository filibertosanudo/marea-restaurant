import { describe, it, expect } from "vitest";
import { pickRepresentativeMenuImage } from "./social-image";

describe("pickRepresentativeMenuImage", () => {
  it("returns null when nothing has an image", () => {
    const result = pickRepresentativeMenuImage([{ items: [{ imageUrl: null }] }]);
    expect(result).toBeNull();
  });

  it("returns the first item's image it finds, across categories", () => {
    const result = pickRepresentativeMenuImage([
      { items: [{ imageUrl: null }] },
      { items: [{ imageUrl: null }, { imageUrl: "https://cdn.example.com/lobster.jpg" }] },
    ]);
    expect(result).toBe("https://cdn.example.com/lobster.jpg");
  });

  it("returns null for an empty menu", () => {
    expect(pickRepresentativeMenuImage([])).toBeNull();
  });
});
