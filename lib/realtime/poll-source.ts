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
 * The first tick only records a baseline. Whatever changed before it is the
 * hub's to cover with a reconcile when it switches to this source.
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
        if (previous !== undefined && previous !== signature) {
          this.options.onChange({ kind: "reconcile", businessId });
        }
      } catch {
        // a transient database hiccup skips this business for one tick
      }
    }
    for (const known of this.signatures.keys()) {
      if (!watched.has(known)) this.signatures.delete(known);
    }
    if (this.running) this.timer = setTimeout(() => void this.tick(), this.options.intervalMs);
  }
}
