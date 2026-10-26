import "server-only";
import { env } from "@/lib/env";

/** Whether this deployment is the public portfolio demo (DEMO_MODE). */
export function isDemo(): boolean {
  return env.DEMO_MODE;
}

/**
 * Thrown by the few writes the demo refuses: the ones that would leave it
 * broken for the next visitor (changing a shared account's password, removing
 * a teammate, connecting a real Stripe account). The screens that offer them
 * show a demo notice instead of the form, so this is the server's word on it,
 * not something a visitor is expected to reach.
 */
export class DemoModeError extends Error {
  constructor(what: string) {
    super(`Not available in the demo: ${what}`);
    this.name = "DemoModeError";
  }
}

export function assertNotDemo(what: string): void {
  if (isDemo()) throw new DemoModeError(what);
}
