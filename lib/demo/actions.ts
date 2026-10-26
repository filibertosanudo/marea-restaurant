"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { DEMO_PERSONAS, type DemoPersonaKey } from "@/lib/demo/personas";
import { isDemo } from "@/lib/demo/mode";

export type DemoLoginState = { error: "unavailable" | "failed" } | undefined;

/**
 * One click, signed in as a seeded persona of the public demo. Goes through
 * the same credentials sign-in as the form, with the account's own published
 * password: nothing here can sign in as anyone the form could not, and outside
 * DEMO_MODE it does nothing at all.
 */
export async function demoLoginAction(_prev: DemoLoginState, formData: FormData): Promise<DemoLoginState> {
  if (!isDemo()) return { error: "unavailable" };
  const persona = DEMO_PERSONAS.find((candidate) => candidate.key === (formData.get("persona") as DemoPersonaKey));
  if (!persona) return { error: "unavailable" };
  try {
    await signIn("credentials", { email: persona.email, password: persona.password, redirectTo: persona.landing });
  } catch (error) {
    if (error instanceof AuthError) return { error: "failed" };
    throw error;
  }
}
