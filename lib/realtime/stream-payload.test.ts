import { describe, it, expect } from "vitest";
import { parseStreamPayload } from "./stream-payload";

describe("parseStreamPayload", () => {
  it("reads a list of changes", () => {
    expect(parseStreamPayload('{"changes":[{"kind":"order","orderId":"o1","status":"READY"},{"kind":"cash","orderId":null,"status":null}]}')).toEqual({
      changes: [
        { kind: "order", orderId: "o1", status: "READY" },
        { kind: "cash", orderId: null, status: null },
      ],
    });
  });

  it("reads a reconcile", () => {
    expect(parseStreamPayload('{"reconcile":true}')).toEqual({ reconcile: true });
  });

  it("returns null for an empty body (a guest's update), a non-string, or anything that is not that shape", () => {
    for (const bad of ["{}", "", "not json", "null", "[]", '{"changes":"x"}', '{"changes":[{"kind":"other"}]}', '{"changes":[null]}', 5, undefined]) {
      expect(parseStreamPayload(bad), String(bad)).toBeNull();
    }
  });
});
