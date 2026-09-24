// No imports on purpose. The public landing's reservation form needs this one
// number in the browser, and it used to import it from schemas.ts, whose
// `import "zod"` shipped the whole validation library to every visitor for the
// sake of a constant. lib/reservations/limits.test.ts fails if this file ever
// grows an import.

/** How far out a guest can even ask about — a business decision, not a derived constant. 90 days is the common horizon real booking systems use. */
export const MAX_BOOKING_HORIZON_DAYS = 90;
