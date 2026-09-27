import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness } from "@/test/factories";
import { getMailer } from "@/lib/notifications";
import { sendAnonymizeAlert } from "./anonymize-alert";

vi.mock("@/lib/notifications", () => ({ getMailer: vi.fn() }));

function stubMailer() {
  const send = vi.fn(async (message: { to: string; subject: string; html: string; text: string }) => {
    void message;
    return { providerMessageId: null };
  });
  vi.mocked(getMailer).mockReturnValue({ send });
  return send;
}

const OLD = new Date(Date.now() - 25 * 30 * 24 * 60 * 60 * 1000); // 25 months
const RECENT = new Date(Date.now() - 1 * 30 * 24 * 60 * 60 * 1000);

describe("sendAnonymizeAlert", () => {
  it("sends nothing when no business has overdue guest rows", async () => {
    await makeBusiness({ name: "Fresh" });
    const send = stubMailer();

    const result = await sendAnonymizeAlert("owner@marea.test");

    expect(result).toEqual({ overdueBusinesses: 0, totalRows: 0, sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it("emails a per-business breakdown when rows are overdue, and nothing is anonymized", async () => {
    const business = await makeBusiness({ name: "Overdue Co" });
    await prisma.order.create({
      data: { businessId: business.id, orderNumber: "A-0001", guestName: "Ana", guestEmail: "ana@example.com", createdAt: OLD },
    });
    await prisma.order.create({
      data: { businessId: business.id, orderNumber: "A-0002", guestName: "Beto", guestEmail: "beto@example.com", createdAt: RECENT },
    });
    const send = stubMailer();

    const result = await sendAnonymizeAlert("owner@marea.test");

    expect(result).toEqual({ overdueBusinesses: 1, totalRows: 1, sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe("owner@marea.test");
    expect(message.subject).toContain("1 business");
    expect(message.text).toContain("Overdue Co");
    expect(message.text).toContain("1 order(s)");
    expect(message.text).toContain("privacy:anonymize-guests");

    // Nothing was touched: the recent order's guest data is unchanged, and
    // the old one's is still there — this function only reports.
    const stillThere = await prisma.order.findMany({ where: { businessId: business.id }, select: { guestEmail: true } });
    expect(stillThere.map((o) => o.guestEmail).sort()).toEqual(["ana@example.com", "beto@example.com"]);
  });
});
