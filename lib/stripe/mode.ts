import "server-only";
import { env } from "@/lib/env";

/** The mode (live or test) of the platform's secret key. An account or event of the other mode does not belong to it. */
export function platformKeyIsLive(): boolean {
  return (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}
