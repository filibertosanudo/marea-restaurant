import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  updateOpeningHoursAction,
  createClosureAction,
  deleteClosureAction,
  updateBusinessSettingsAction,
  updateBusinessTranslationAction,
} from "./actions";
import { getBusinessClosuresForAdmin } from "./queries";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function fullWeek(overrides: Partial<{ dayOfWeek: number; isOpen: boolean }> = {}) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    blocks: [{ opensAt: "09:00", closesAt: "22:00" }],
    ...overrides,
  }));
}

function closureForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("updateOpeningHoursAction", () => {
  it("replaces the whole week's opening hours", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await updateOpeningHoursAction(fullWeek());

    expect(result).toEqual({ success: true });
    const hours = await prisma.openingHour.findMany({ where: { businessId: business.id } });
    expect(hours).toHaveLength(7);
  });

  it("rejects overlapping blocks on the same day", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const days = fullWeek();
    days[0].blocks = [
      { opensAt: "09:00", closesAt: "14:00" },
      { opensAt: "13:00", closesAt: "18:00" },
    ];

    const result = await updateOpeningHoursAction(days);

    expect(result).toMatchObject({ error: "invalid" });
  });
});

describe("createClosureAction / deleteClosureAction", () => {
  it("creates an all-day closure and lists it for the admin", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createClosureAction(
      undefined,
      closureForm({ date: "2026-12-25", allDay: "on", reason: "Christmas" })
    );

    expect(result).toEqual({ success: true });
    const closures = await getBusinessClosuresForAdmin(business.id);
    expect(closures).toHaveLength(1);
    expect(closures[0].reason).toBe("Christmas");
  });

  it("rejects a partial-day closure with an end time before the start", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await createClosureAction(
      undefined,
      closureForm({ date: "2026-12-25", allDay: "", startTime: "18:00", endTime: "17:00" })
    );

    expect(result).toMatchObject({ error: "invalid" });
  });

  it("deletes a closure", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const closure = await prisma.businessClosure.create({
      data: { businessId: business.id, startsAt: new Date(), endsAt: new Date() },
    });

    await deleteClosureAction(closure.id);

    const remaining = await prisma.businessClosure.findUnique({ where: { id: closure.id } });
    expect(remaining).toBeNull();
  });
});

describe("updateBusinessSettingsAction", () => {
  it("updates the business's own settings", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await updateBusinessSettingsAction(
      undefined,
      closureForm({
        defaultLocale: "en",
        currency: "USD",
        timezone: "America/Tijuana",
        defaultReservationMinutes: "60",
        maxPartySize: "8",
        acceptsOnlinePayment: "on",
        minBookingLeadMinutes: "15",
        minCancelLeadMinutes: "60",
      })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.currency).toBe("USD");
    expect(updated.maxPartySize).toBe(8);
  });

  it("refuses to enable card payments for a business with no Stripe account once another shares the deployment", async () => {
    const business = await makeBusiness({ slug: "marea", acceptsOnlinePayment: false });
    await makeBusiness({ slug: "cala" });
    setTestSession(sessionUserFromRow(await makeStaff("BUSINESS_ADMIN"), { businessId: business.id }));

    const fields = {
      defaultLocale: "en",
      currency: "USD",
      timezone: "America/Tijuana",
      defaultReservationMinutes: "60",
      maxPartySize: "8",
      minBookingLeadMinutes: "15",
      minCancelLeadMinutes: "60",
    };
    const refused = await updateBusinessSettingsAction(undefined, closureForm({ ...fields, acceptsOnlinePayment: "on" }));

    expect(refused).toEqual({ error: "invalid", fieldErrors: { acceptsOnlinePayment: "no_connected_account" } });
    expect((await prisma.business.findUniqueOrThrow({ where: { id: business.id } })).acceptsOnlinePayment).toBe(false);

    // An account that cannot charge yet is not enough, however it got there.
    await prisma.business.update({
      where: { id: business.id },
      data: { stripeAccountId: "acct_test", stripeCardPaymentsStatus: "PENDING" },
    });
    const pending = await updateBusinessSettingsAction(undefined, closureForm({ ...fields, acceptsOnlinePayment: "on" }));
    expect(pending).toEqual({ error: "invalid", fieldErrors: { acceptsOnlinePayment: "account_not_active" } });

    // With an account that can charge it may.
    await prisma.business.update({ where: { id: business.id }, data: { stripeCardPaymentsStatus: "ACTIVE" } });
    const allowed = await updateBusinessSettingsAction(undefined, closureForm({ ...fields, acceptsOnlinePayment: "on" }));
    expect(allowed).toEqual({ success: true });
  });

  it("rejects a booking lead time longer than the cancel lead time", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await updateBusinessSettingsAction(
      undefined,
      closureForm({
        defaultLocale: "en",
        currency: "USD",
        timezone: "America/Tijuana",
        defaultReservationMinutes: "60",
        maxPartySize: "8",
        acceptsOnlinePayment: "on",
        minBookingLeadMinutes: "200",
        minCancelLeadMinutes: "60",
      })
    );

    expect(result).toMatchObject({ error: "invalid" });
  });
});

describe("updateBusinessTranslationAction", () => {
  it("upserts both locales' content", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();

    const result = await updateBusinessTranslationAction(
      undefined,
      closureForm({
        "en.tagline": "Fresh every day",
        "en.shortBlurb": "",
        "en.aboutTitle": "",
        "en.aboutBody": "",
        "es.tagline": "Fresco cada día",
        "es.shortBlurb": "",
        "es.aboutTitle": "",
        "es.aboutBody": "",
      })
    );

    expect(result).toEqual({ success: true });
    const rows = await prisma.businessTranslation.findMany({ where: { businessId: business.id } });
    expect(rows.map((r) => r.locale).sort()).toEqual(["en", "es"]);
  });

  it("deletes a locale's row instead of leaving it blank, so the public site still falls back to the other locale", async () => {
    // Regression: an upserted row with every field null still matches its
    // own locale in pickTranslation's `find`, which would stop the landing
    // from ever falling back to the locale that actually has content.
    const business = await makeBusiness({ slug: "marea" });
    await prisma.businessTranslation.create({
      data: { businessId: business.id, locale: "es", tagline: "Frescura del océano" },
    });
    await loginAsAdmin();

    const result = await updateBusinessTranslationAction(
      undefined,
      closureForm({
        "en.tagline": "",
        "en.shortBlurb": "",
        "en.aboutTitle": "",
        "en.aboutBody": "",
        "es.tagline": "Frescura del océano",
        "es.shortBlurb": "",
        "es.aboutTitle": "",
        "es.aboutBody": "",
      })
    );

    expect(result).toEqual({ success: true });
    const rows = await prisma.businessTranslation.findMany({ where: { businessId: business.id } });
    expect(rows.map((r) => r.locale)).toEqual(["es"]);
  });
});
