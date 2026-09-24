import type { RealtimeEvent } from "@/lib/realtime/events";
import { HUB_IDLE_GRACE_MS, POLL_FALLBACK_DELAY_MS } from "@/lib/realtime/timing";

/** A screen's interest: everything in a business (the board), or one order (order tracking). */
export type Subscription = { businessId: string; orderId?: string };

type ListenLike = {
  start(): void;
  stop(): Promise<void>;
  onEvent(handler: (event: RealtimeEvent) => void): void;
  onHealth(handler: (healthy: boolean) => void): void;
  readonly isHealthy: boolean;
};

type PollLike = { start(): void; stop(): void };

export type RealtimeHubOptions = {
  mode: "auto" | "poll";
  createListen: () => ListenLike;
  createPoll: (businesses: () => string[], emit: (event: RealtimeEvent) => void) => PollLike;
  pollFallbackDelayMs?: number;
  idleGraceMs?: number;
};

/**
 * The single place every connected screen in this process gets its events
 * from, so the database sees one LISTEN connection (or one polling loop) no
 * matter how many screens are open.
 *
 * Policy, on top of ListenSource's mechanism: listen when it works, poll when
 * it does not, and never go silent. While listening is unhealthy for longer
 * than a short delay, a poller takes over; when listening comes back the
 * poller stops. Every switch broadcasts a reconcile, because the moment
 * between the two is exactly when a change can slip through.
 *
 * Degraded is allowed, dead is not: with REALTIME_MODE=poll, or a host where
 * LISTEN cannot work at all, the board keeps updating, only slower.
 */
export class RealtimeHub {
  private readonly options: RealtimeHubOptions;
  private subscribers = new Map<symbol, { subscription: Subscription; handler: (event: RealtimeEvent) => void }>();
  private listen: ListenLike | null = null;
  private poll: PollLike | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(options: RealtimeHubOptions) {
    this.options = options;
  }

  /** What is feeding screens right now. */
  get mode(): "listen" | "poll" | "idle" {
    if (!this.running) return "idle";
    return this.poll ? "poll" : "listen";
  }

  subscribe(subscription: Subscription, handler: (event: RealtimeEvent) => void): () => void {
    const id = Symbol("subscriber");
    this.subscribers.set(id, { subscription, handler });
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.startIfNeeded();
    return () => {
      this.subscribers.delete(id);
      if (this.subscribers.size === 0 && this.running && !this.idleTimer) {
        this.idleTimer = setTimeout(() => void this.shutdown(), this.options.idleGraceMs ?? HUB_IDLE_GRACE_MS);
      }
    };
  }

  private startIfNeeded(): void {
    if (this.running) return;
    this.running = true;
    if (this.options.mode === "poll") {
      this.startPoll();
      return;
    }
    const listen = this.options.createListen();
    this.listen = listen;
    listen.onEvent((event) => this.dispatch(event));
    listen.onHealth((healthy) => this.onListenHealth(healthy));
    listen.start();
    this.armFallback();
  }

  private onListenHealth(healthy: boolean): void {
    if (!this.running) return;
    if (healthy) {
      this.clearFallback();
      this.stopPoll();
      // Every arrival at "listening", the first included, may follow a gap the
      // screens cannot know about: a change between a page render and the
      // moment LISTEN was actually in place, or the stretch spent polling.
      this.dispatch({ kind: "reconcile", businessId: null });
    } else {
      this.armFallback();
    }
  }

  private armFallback(): void {
    if (this.fallbackTimer || this.poll) return;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      if (this.running && !this.listen?.isHealthy) {
        this.startPoll();
        this.dispatch({ kind: "reconcile", businessId: null });
      }
    }, this.options.pollFallbackDelayMs ?? POLL_FALLBACK_DELAY_MS);
  }

  private clearFallback(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private startPoll(): void {
    if (this.poll) return;
    const businesses = () => [...new Set([...this.subscribers.values()].map((s) => s.subscription.businessId))];
    this.poll = this.options.createPoll(businesses, (event) => this.dispatch(event));
    this.poll.start();
  }

  private stopPoll(): void {
    this.poll?.stop();
    this.poll = null;
  }

  private dispatch(event: RealtimeEvent): void {
    for (const { subscription, handler } of this.subscribers.values()) {
      if (!matches(subscription, event)) continue;
      try {
        handler(event);
      } catch {
        // one screen's failure must not stop the others
      }
    }
  }

  private async shutdown(): Promise<void> {
    this.idleTimer = null;
    if (this.subscribers.size > 0) return;
    this.running = false;
    this.clearFallback();
    this.stopPoll();
    const listen = this.listen;
    this.listen = null;
    await listen?.stop();
  }
}

function matches(subscription: Subscription, event: RealtimeEvent): boolean {
  if (event.kind === "reconcile") {
    return event.businessId === null || event.businessId === subscription.businessId;
  }
  if (event.businessId !== subscription.businessId) return false;
  // A screen watching one order never hears about the rest of the business.
  return subscription.orderId === undefined || event.orderId === subscription.orderId;
}
