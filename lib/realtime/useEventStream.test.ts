import { describe, it, expect } from "vitest";
import { parseStreamPayload, shouldRefreshOnOpen } from "./useEventStream";

describe("shouldRefreshOnOpen", () => {
  it("does not refresh the first time a screen connects: its page just rendered", () => {
    expect(shouldRefreshOnOpen({ hasBeenOpen: false, plannedHandoff: false })).toBe(false);
  });

  it("refreshes after a connection that dropped, since nothing replays what it missed", () => {
    expect(shouldRefreshOnOpen({ hasBeenOpen: true, plannedHandoff: false })).toBe(true);
  });

  it("does not refresh on the server's scheduled handoff, which repeats every 75 s on a healthy connection", () => {
    expect(shouldRefreshOnOpen({ hasBeenOpen: true, plannedHandoff: true })).toBe(false);
  });
});

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
