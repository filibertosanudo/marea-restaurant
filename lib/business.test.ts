import { describe, expect, it } from "vitest";
import { originFor, slugFromHost, validateSlug } from "@/lib/business-host";

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

describe("validateSlug", () => {
  it("accepts a single lowercase DNS label", () => {
    expect(validateSlug("cala")).toBeNull();
    expect(validateSlug("marea-norte-2")).toBeNull();
    expect(validateSlug("a")).toBeNull();
  });

  it("refuses anything that is not one", () => {
    for (const bad of ["", "Cala", "cala.norte", "-cala", "cala-", "ca la", "ñandu", "x".repeat(33)]) {
      expect(validateSlug(bad), bad).not.toBeNull();
    }
  });

  it("refuses names that belong to the platform", () => {
    for (const reserved of ["www", "admin", "api", "login"]) {
      expect(validateSlug(reserved), reserved).toBe("that name is reserved");
    }
  });
});
