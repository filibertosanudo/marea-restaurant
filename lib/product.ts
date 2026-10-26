import "server-only";
import { env } from "@/lib/env";

/** The system's name in the panel (PRODUCT_NAME), never a restaurant's. */
export function productName(): string {
  return env.PRODUCT_NAME;
}

/** Whether strangers may sign a restaurant up here (SIGNUP_ENABLED); never in the demo. */
export function signupOpen(): boolean {
  return env.SIGNUP_ENABLED && !env.DEMO_MODE;
}
