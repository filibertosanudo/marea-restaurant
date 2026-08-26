-- Prisma can't express a Postgres EXCLUDE constraint, so this migration is
-- hand-written rather than generated from schema.prisma. It's the actual
-- guarantee that two overlapping reservations can never both land on the
-- same table: the availability check in lib/reservations/availability.ts
-- (and the read in the Server Action before it) narrow the race window,
-- but only this constraint closes it. See prisma/schema.prisma's comment
-- on the Reservation model, where this exact SQL is documented in advance.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation" ADD CONSTRAINT reservation_no_overlap
  EXCLUDE USING gist (
    "tableId" WITH =,
    tsrange("reservedFor", "endsAt") WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED','SEATED'));
