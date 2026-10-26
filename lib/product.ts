import "server-only";
import { env } from "@/lib/env";

/** The system's name in the panel (PRODUCT_NAME), never a restaurant's. */
export function productName(): string {
  return env.PRODUCT_NAME;
}

