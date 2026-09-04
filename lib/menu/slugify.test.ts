import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and strips accents", () => {
    expect(slugify("Café")).toBe("cafe");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Lobster Thermidor!!")).toBe("lobster-thermidor");
  });

  it("trims a leading or trailing hyphen", () => {
    expect(slugify("  Extra Cheese  ")).toBe("extra-cheese");
  });
});
