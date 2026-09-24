import type { RealtimeEvent } from "@/lib/realtime/events";

export type PollSourceOptions = {
  /** The businesses somebody is watching right now; asked again on every tick. */
  businesses: () => string[];
  signature: (businessId: string) => Promise<string>;
  onChange: (event: RealtimeEvent) => void;
  intervalMs: number;
};

/**
 * The fallback for a host where LISTEN does not work: compares one fingerprint
 * per watched business every `intervalMs` and reports "something changed",
 * never what. One loop for the whole process, not one per connected screen, so
 * five screens cost the same as one.
 *
 * The first look at a business records its baseline and says "reconcile":
 * whatever changed between a screen rendering and this first fingerprint is
 * unknowable, and on a cold server that gap can be seconds long.
 *
 * A business's last fingerprint is kept even while nobody watches it. Dropping
 * it would make the next tick after a screen reconnects (the scheduled handoff
 * leaves a gap of no subscribers) record a fresh baseline instead of noticing
 * what changed meanwhile.
 */
export class PollSource {
  private readonly options: PollSourceOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private signatures = new Map<string, string>();

  constructor(options: PollSourceOptions) {
    this.options = options;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.signatures.clear();
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    const watched = new Set(this.options.businesses());
    for (const businessId of watched) {
      try {
        const signature = await this.options.signature(businessId);
        const previous = this.signatures.get(businessId);
        this.signatures.set(businessId, signature);
        if (previous !== signature) {
          this.options.onChange({ kind: "reconcile", businessId });
        }
      } catch {
        // a transient database hiccup skips this business for one tick
      }
    }
    if (this.running) this.timer = setTimeout(() => void this.tick(), this.options.intervalMs);
  }
}
