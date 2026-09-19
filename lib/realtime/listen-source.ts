import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  RECOVERY_WINDOW_MS,
} from "@/lib/realtime/timing";
import { CHANGE_CHANNEL, PING_CHANNEL, parseChange, type RealtimeEvent } from "@/lib/realtime/events";

/** The slice of node-postgres' Client this file uses, so a test can put a fake behind it. */
export type ListenClient = {
  connect(): Promise<unknown>;
  query(text: string, values?: unknown[]): Promise<unknown>;
  on(event: "notification", listener: (message: { channel: string; payload?: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  end(): Promise<void>;
};

export type ListenSourceOptions = {
  createClient: () => ListenClient;
  sweep: (since: Date) => Promise<RealtimeEvent[]>;
  now?: () => number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  recoveryWindowMs?: number;
};

/**
 * Holds one dedicated connection that does nothing but LISTEN, and turns what
 * it hears into events. It is the mechanism, not the policy: whether to fall
 * back to polling while it is unhealthy is the hub's call.
 *
 * Three ways it stays honest:
 *
 *  1. Recovery. A NOTIFY sent while no session listens is gone for good, so
 *     after every reconnect it LISTENs first (nothing committed from then on
 *     can be missed) and only then sweeps the tables for what changed since
 *     the channel was last known healthy, minus RECOVERY_WINDOW_MS. That order
 *     matters: sweeping first leaves a gap between the sweep and the LISTEN.
 *  2. Heartbeat. A connection can be up and deaf: a transaction-mode pooler
 *     accepts LISTEN and never delivers, and a half-open TCP connection raises
 *     no error for minutes. So it periodically NOTIFYs its own ping channel and
 *     requires the echo, and it proves the channel once before claiming health.
 *  3. Backoff. Reconnects wait 1 s, doubling to 30 s, so a database that is
 *     down is not hammered.
 */
export class ListenSource {
  private readonly createClient: () => ListenClient;
  private readonly sweep: (since: Date) => Promise<RealtimeEvent[]>;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly recoveryWindowMs: number;

  private eventHandlers: Array<(event: RealtimeEvent) => void> = [];
  private healthHandlers: Array<(healthy: boolean) => void> = [];
  private stopped = true;
  private healthy = false;
  private client: ListenClient | null = null;
  /** The last moment the channel was proven to deliver; the sweep re-reads from here. Null until the first healthy moment. */
  private lastHealthyAt: number | null = null;
  private pendingPing: { token: string; resolve: () => void } | null = null;
  private pingCounter = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private dropWaiter: (() => void) | null = null;

  constructor(options: ListenSourceOptions) {
    this.createClient = options.createClient;
    this.sweep = options.sweep;
    this.now = options.now ?? Date.now;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    this.reconnectBaseMs = options.reconnectBaseMs ?? RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? RECONNECT_MAX_MS;
    this.recoveryWindowMs = options.recoveryWindowMs ?? RECOVERY_WINDOW_MS;
  }

  get isHealthy(): boolean {
    return this.healthy;
  }

  onEvent(handler: (event: RealtimeEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  onHealth(handler: (healthy: boolean) => void): void {
    this.healthHandlers.push(handler);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.run();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const client = this.client;
    this.client = null;
    this.lastHealthyAt = null;
    this.setHealthy(false);
    this.dropWaiter?.();
    await client?.end().catch(() => {});
  }

  private async run(): Promise<void> {
    let delay = this.reconnectBaseMs;
    while (!this.stopped) {
      try {
        await this.connectOnce();
        delay = this.reconnectBaseMs;
        // A drop during connectOnce has already discarded the client.
        if (this.client !== null) {
          await new Promise<void>((resolve) => {
            this.dropWaiter = resolve;
          });
        }
      } catch {
        // connect, LISTEN, sweep or the first heartbeat failed: drop it all and retry
        this.discardClient();
      }
      this.setHealthy(false);
      if (this.stopped) return;
      await this.sleep(delay);
      delay = Math.min(delay * 2, this.reconnectMaxMs);
    }
  }

  private async connectOnce(): Promise<void> {
    const client = this.createClient();
    this.client = client;
    client.on("notification", (message) => this.handleNotification(message));
    client.on("error", () => this.drop(client));
    client.on("end", () => this.drop(client));

    await client.connect();
    await client.query(`LISTEN ${CHANGE_CHANNEL}`);
    await client.query(`LISTEN ${PING_CHANNEL}`);

    // LISTEN is active, so anything committed from here on arrives live.
    // Sweep what was missed while away, widened by the window (see timing.ts).
    if (this.lastHealthyAt !== null) {
      const events = await this.sweep(new Date(this.lastHealthyAt - this.recoveryWindowMs));
      for (const event of events) this.emit(event);
    }

    // Prove the channel delivers before saying so; a pooler that swallows
    // LISTEN is caught here, not thirty seconds into a quiet service.
    await this.ping(client);
    this.lastHealthyAt = this.now();
    this.setHealthy(true);
    this.scheduleHeartbeat(client);
  }

  private scheduleHeartbeat(client: ListenClient): void {
    const timer = setTimeout(async () => {
      this.timers.delete(timer);
      if (this.client !== client) return;
      try {
        await this.ping(client);
        this.lastHealthyAt = this.now();
        this.scheduleHeartbeat(client);
      } catch {
        this.drop(client);
      }
    }, this.heartbeatIntervalMs);
    this.timers.add(timer);
  }

  private async ping(client: ListenClient): Promise<void> {
    const token = `${this.now()}-${++this.pingCounter}`;
    const echoed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.pendingPing?.token === token) this.pendingPing = null;
        reject(new Error("realtime heartbeat: no echo"));
      }, this.heartbeatTimeoutMs);
      this.timers.add(timer);
      this.pendingPing = {
        token,
        resolve: () => {
          clearTimeout(timer);
          this.timers.delete(timer);
          resolve();
        },
      };
    });
    // If the query itself fails, the pending timer must not fire an
    // unhandled rejection later.
    echoed.catch(() => {});
    await client.query("SELECT pg_notify($1, $2)", [PING_CHANNEL, token]);
    await echoed;
  }

  private handleNotification(message: { channel: string; payload?: string }): void {
    if (message.channel === PING_CHANNEL) {
      const pending = this.pendingPing;
      if (pending && pending.token === message.payload) {
        pending.resolve();
        this.pendingPing = null;
      }
      return;
    }
    if (message.channel !== CHANGE_CHANNEL) return;
    const event = parseChange(message.payload);
    if (event) this.emit(event);
  }

  private drop(client: ListenClient): void {
    if (this.client !== client) return;
    this.discardClient();
    this.dropWaiter?.();
  }

  private discardClient(): void {
    const client = this.client;
    this.client = null;
    this.pendingPing = null;
    void client?.end().catch(() => {});
  }

  private setHealthy(healthy: boolean): void {
    if (this.healthy === healthy) return;
    this.healthy = healthy;
    for (const handler of this.healthHandlers) handler(healthy);
  }

  private emit(event: RealtimeEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // one bad subscriber must not take the channel down
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }
}
