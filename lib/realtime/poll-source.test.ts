import { describe, it, expect, afterEach } from "vitest";
import { PollSource } from "./poll-source";
import type { RealtimeEvent } from "./events";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let source: PollSource | null = null;
afterEach(() => source?.stop());

describe("PollSource", () => {
  it("reconciles on the first look, then only when the fingerprint changes", async () => {
    const events: RealtimeEvent[] = [];
    let current = "v1";
    source = new PollSource({
      businesses: () => ["biz"],
      signature: async () => current,
      onChange: (event) => events.push(event),
      intervalMs: 15,
    });
    source.start();
    await sleep(60);
    expect(events).toEqual([{ kind: "reconcile", businessId: "biz" }]); // the baseline itself

    current = "v2";
    await sleep(60);
    expect(events).toEqual([
      { kind: "reconcile", businessId: "biz" },
      { kind: "reconcile", businessId: "biz" },
    ]);
  });

  it("polls each watched business once per tick, however many screens watch it", async () => {
    const asked: string[] = [];
    source = new PollSource({
      businesses: () => ["a", "b"],
      signature: async (id) => {
        asked.push(id);
        return "same";
      },
      onChange: () => {},
      intervalMs: 1000,
    });
    source.start();
    await sleep(30);
    expect(asked.sort()).toEqual(["a", "b"]);
  });

  it("skips a business for one tick when its query fails, and keeps going", async () => {
    const events: RealtimeEvent[] = [];
    let calls = 0;
    source = new PollSource({
      businesses: () => ["biz"],
      signature: async () => {
        calls += 1;
        if (calls === 2) throw new Error("database hiccup");
        return calls < 2 ? "v1" : "v2";
      },
      onChange: (event) => events.push(event),
      intervalMs: 15,
    });
    source.start();
    await sleep(90);
    // the first look, then the change after the skipped tick
    expect(events).toEqual([
      { kind: "reconcile", businessId: "biz" },
      { kind: "reconcile", businessId: "biz" },
    ]);
  });

  it("still notices what changed while nobody was watching, once someone is back", async () => {
    const events: RealtimeEvent[] = [];
    let watched = ["biz"];
    let current = "v1";
    source = new PollSource({
      businesses: () => watched,
      signature: async () => current,
      onChange: (event) => events.push(event),
      intervalMs: 15,
    });
    source.start();
    await sleep(40); // baseline recorded (and reported)
    events.length = 0;

    watched = []; // the last screen is between two connections
    await sleep(40);
    current = "v2";
    await sleep(40);
    expect(events).toEqual([]);

    watched = ["biz"]; // a screen reconnects
    await sleep(60);
    expect(events).toEqual([{ kind: "reconcile", businessId: "biz" }]);
  });
});
