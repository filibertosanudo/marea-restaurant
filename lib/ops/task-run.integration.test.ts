import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runTask } from "./task-run";

// The harness points DATABASE_URL at this file's own schema (search_path in the
// URL), so a plain pg client sees the migrated tables.
let client: pg.Client;
let second: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  second = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await Promise.all([client.connect(), second.connect()]);
});

afterAll(async () => {
  await Promise.all([client.end(), second.end()]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rows(task: string) {
  return (await client.query(`SELECT slot, status, processed, detail, "finishedAt" FROM "OpsTaskRun" WHERE task = $1 ORDER BY slot`, [task])).rows;
}

describe("runTask", () => {
  it("records a success with what it processed", async () => {
    const outcome = await runTask(client, { task: "t-ok", slot: "s1", execute: async () => ({ processed: 42, detail: "42 rows" }) });

    expect(outcome).toBe("succeeded");
    const [row] = await rows("t-ok");
    expect(row).toMatchObject({ slot: "s1", status: "SUCCEEDED", processed: "42", detail: "42 rows" });
    expect(row.finishedAt).toBeInstanceOf(Date);
  });

  it("does not run a slot that already succeeded", async () => {
    const execute = vi.fn(async () => ({}));
    await runTask(client, { task: "t-idem", slot: "s1", execute });
    const again = await runTask(client, { task: "t-idem", slot: "s1", execute });

    expect(again).toBe("skipped-done");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await rows("t-idem")).toHaveLength(1);
  });

  it("runs a new slot of the same task", async () => {
    const execute = vi.fn(async () => ({}));
    await runTask(client, { task: "t-slots", slot: "s1", execute });
    await runTask(client, { task: "t-slots", slot: "s2", execute });

    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("records a failure, rethrows it, and lets the same slot run again", async () => {
    await expect(
      runTask(client, {
        task: "t-fail",
        slot: "s1",
        execute: async () => {
          throw new Error("disk full");
        },
      })
    ).rejects.toThrow("disk full");
    expect(await rows("t-fail")).toMatchObject([{ status: "FAILED", detail: "disk full" }]);

    const retry = await runTask(client, { task: "t-fail", slot: "s1", execute: async () => ({ processed: 1 }) });
    expect(retry).toBe("succeeded");
    expect(await rows("t-fail")).toMatchObject([{ status: "SUCCEEDED", detail: null }]);
  });

  it("lets only one run of a task go at a time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));

    const first = runTask(client, {
      task: "t-lock",
      slot: "s1",
      execute: async () => {
        started();
        await gate;
        return {};
      },
    });
    await running;
    const concurrent = await runTask(second, { task: "t-lock", slot: "s2", execute: async () => ({}) });
    release();
    await first;

    expect(concurrent).toBe("skipped-locked");
    expect(await rows("t-lock")).toHaveLength(1);
  });

  it("pings the monitor after a success and not after a failure", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await runTask(client, { task: "t-ping", slot: "s1", monitorUrl: "https://monitor.example/ping/abc", execute: async () => ({}) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://monitor.example/ping/abc");

    await expect(
      runTask(client, {
        task: "t-ping",
        slot: "s2",
        monitorUrl: "https://monitor.example/ping/abc",
        execute: async () => {
          throw new Error("boom");
        },
      })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a success a success when the monitor is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("dns"))));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const outcome = await runTask(client, { task: "t-down", slot: "s1", monitorUrl: "https://monitor.example/x", execute: async () => ({}) });

    expect(outcome).toBe("succeeded");
    expect(await rows("t-down")).toMatchObject([{ status: "SUCCEEDED" }]);
  });
});
