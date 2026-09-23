import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { makeBusiness, makeOrder, makeStaff } from "@/test/factories";
import { clearTestSession, setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { encodeBoardCursor } from "@/lib/orders/board-cursor";

const request = (query: string) => new NextRequest(`http://localhost/api/orders/board?${query}`);

async function loginAs(role: Parameters<typeof makeStaff>[0]) {
  setTestSession(sessionUserFromRow(await makeStaff(role)));
}

describe("GET /api/orders/board", () => {
  it("turns away anyone who is not staff, and a revoked session", async () => {
    await makeBusiness({ slug: "marea" });

    clearTestSession();
    expect((await GET(request("status=PENDING"))).status).toBe(403);

    setTestSession(sessionUserFromRow(await makeStaff("STAFF"), { revoked: true }));
    expect((await GET(request("status=PENDING"))).status).toBe(403);

    await loginAs("CUSTOMER");
    expect((await GET(request("status=PENDING"))).status).toBe(403);
  });

  it("never answers with the response cacheable by a shared cache", async () => {
    await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const response = await GET(request("status=PENDING"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  describe("by ids", () => {
    it("returns the cards, the ids it does not show, and the totals", async () => {
      const business = await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");
      const mine = await makeOrder(business.id, { status: "PREPARING" });
      await makeOrder(business.id, { status: "PENDING" });

      const response = await GET(request(`ids=${mine.id},nosuchorder`));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.orders.map((o: { id: string }) => o.id)).toEqual([mine.id]);
      expect(body.missing).toEqual(["nosuchorder"]);
      expect(body.totals).toEqual({ PENDING: 1, PREPARING: 1, READY: 0, DELIVERED: 0 });
    });

    it("does not reveal another business's order, and reports it as missing", async () => {
      await makeBusiness({ slug: "marea" });
      const other = await makeBusiness();
      const foreign = await makeOrder(other.id, { status: "PENDING" });
      await loginAs("STAFF");

      const body = await (await GET(request(`ids=${foreign.id}`))).json();

      expect(body.orders).toEqual([]);
      expect(body.missing).toEqual([foreign.id]);
    });

    it("applies the board's filters", async () => {
      const business = await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");
      const takeaway = await makeOrder(business.id, { status: "PENDING", type: "TAKEAWAY" });
      const dineIn = await makeOrder(business.id, { status: "PENDING", type: "DINE_IN" });

      const body = await (await GET(request(`ids=${takeaway.id},${dineIn.id}&type=TAKEAWAY`))).json();

      expect(body.orders.map((o: { id: string }) => o.id)).toEqual([takeaway.id]);
      expect(body.missing).toEqual([dineIn.id]);
    });

    it("refuses a malformed, empty or oversized list", async () => {
      await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");
      const tooMany = Array.from({ length: 51 }, (_, i) => `id${i}`).join(",");

      for (const query of ["ids=", "ids=a%20b", "ids=a;drop", `ids=${tooMany}`]) {
        expect((await GET(request(query))).status, query).toBe(400);
      }
    });
  });

  describe("by column", () => {
    it("returns the next page of one column after a cursor", async () => {
      const business = await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");
      const base = Date.now() - 10 * 60_000;
      const orders = [];
      for (let i = 0; i < 4; i++) {
        orders.push(await makeOrder(business.id, { status: "PENDING", placedAt: new Date(base + i * 1000) }));
      }
      const after = encodeBoardCursor({ placedAt: orders[1].placedAt.toISOString(), id: orders[1].id });

      const body = await (await GET(request(`status=PENDING&after=${encodeURIComponent(after)}`))).json();

      expect(body.orders.map((o: { id: string }) => o.id)).toEqual([orders[2].id, orders[3].id]);
      expect(body.hasMore).toBe(false);
      expect(body.totals.PENDING).toBe(4);
    });

    it("serves the delivered column on request, within the recent window", async () => {
      const business = await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");
      const recent = await makeOrder(business.id, { status: "DELIVERED" });
      await makeOrder(business.id, { status: "DELIVERED", placedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

      const body = await (await GET(request("status=DELIVERED"))).json();

      expect(body.orders.map((o: { id: string }) => o.id)).toEqual([recent.id]);
    });

    it("refuses an unknown status and a cursor it did not produce", async () => {
      await makeBusiness({ slug: "marea" });
      await loginAs("STAFF");

      expect((await GET(request("status=CANCELLED"))).status).toBe(400);
      expect((await GET(request("status=PENDING&after=garbage"))).status).toBe(400);
      expect((await GET(request(""))).status).toBe(400);
    });
  });

  it("answers with the same card the board renders, and nothing beyond it", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAs("STAFF");
    const order = await makeOrder(business.id, { status: "PENDING", guestName: "A Guest", guestPhone: "555", guestEmail: "a@b.c" });

    const [card] = (await (await GET(request(`ids=${order.id}`))).json()).orders;

    expect(Object.keys(card).sort()).toEqual(
      ["canCollectCash", "currency", "id", "items", "notes", "orderNumber", "paymentReading", "placedAt", "printStatus", "status", "tableLabel", "total", "type"].sort()
    );
    expect(JSON.stringify(card)).not.toContain("555");
    expect(JSON.stringify(card)).not.toContain("a@b.c");
  });
});
