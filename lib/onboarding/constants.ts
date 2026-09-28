// Its own file, not lib/onboarding/actions.ts: a "use server" module may
// only export async functions, so a plain constant needed a home neither
// that file nor a client component's own module could give it without
// duplicating the number in both.
export const WIZARD_STEP_COUNT = 4;
