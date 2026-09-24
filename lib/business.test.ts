import { describe, expect, it } from "vitest";
import { slugFromHost } from "@/lib/business-host";

describe("slugFromHost", () => {
  it("takes the one label in front of the root domain", () => {
    expect(slugFromHost("marea.example.com", "example.com")).toBe("marea");
    expect(slugFromHost("Marea.Example.com:3000", "example.com")).toBe("marea");
    expect(slugFromHost("marea.localhost:3000", "localhost")).toBe("marea");
  });

  it("names no business for the bare root domain", () => {
    expect(slugFromHost("example.com", "example.com")).toBeNull();
    expect(slugFromHost("localhost:3000", "localhost")).toBeNull();
    expect(slugFromHost("", "example.com")).toBeNull();
  });

  it("names no business for an unrelated or nested host", () => {
    expect(slugFromHost("marea.evil.com", "example.com")).toBeNull();
    expect(slugFromHost("a.marea.example.com", "example.com")).toBeNull();
    expect(slugFromHost("notexample.com", "example.com")).toBeNull();
    expect(slugFromHost("-x.example.com", "example.com")).toBeNull();
  });
});
