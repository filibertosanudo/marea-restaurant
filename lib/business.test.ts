import { describe, expect, it } from "vitest";
import { originFor, slugFromHost } from "@/lib/business-host";

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

describe("originFor", () => {
  it("is the single origin when no root domain is configured", () => {
    expect(originFor("marea", "https://app.example.com", undefined)).toBe("https://app.example.com");
  });

  it("is the business's own subdomain once one is, keeping scheme and port", () => {
    expect(originFor("marea", "https://example.com", "example.com")).toBe("https://marea.example.com");
    expect(originFor("marea", "http://localhost:3000", "localhost")).toBe("http://marea.localhost:3000");
  });
});
