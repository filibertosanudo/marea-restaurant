import { describe, it, expect } from "vitest";
import { shouldRefreshOnOpen } from "./useEventStream";

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
