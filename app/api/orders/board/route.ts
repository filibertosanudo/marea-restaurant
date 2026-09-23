import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { toBoardOrderDTO } from "@/lib/orders/dto";
import { decodeBoardCursor } from "@/lib/orders/board-cursor";
import {
  countBoardOrdersRaw,
  listBoardOrdersByIdsRaw,
  listBoardPageRaw,
  type BoardFilters,
} from "@/lib/orders/queries";
import { COLUMN_STATUSES } from "@/lib/orders/board-state";
import type { BoardColumnStatus } from "@/lib/orders/state-machine";
import type { OrderType } from "@/lib/generated/prisma/client";

/** More than a screen's worth of changes in one event is a reconcile, not a delta; the client never asks for more than this. */
const MAX_IDS = 50;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * What the board asks for after the live stream says something changed, or
 * when a column needs more cards. Two shapes, both staff-only and scoped to
 * the current business:
 *
 *  - `?ids=a,b,c`: the cards for those orders, in any status, plus the ids the
 *    server does not show this view and the columns' totals. One card per
 *    event instead of re-rendering the whole board.
 *  - `?status=PENDING&after=<cursor>`: the next page of a column.
 *
 * Both take the board's own `type` and `table` filters, so a filtered board
 * never receives a card it is hiding.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.revoked || !STAFF_ROLES.includes(session.user.role)) {
    return json({ error: "forbidden" }, 403);
  }

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const filters: BoardFilters = {
    orderType: type === "DINE_IN" || type === "TAKEAWAY" ? (type as OrderType) : undefined,
    tableId: params.get("table") || undefined,
  };
  const business = await getCurrentBusiness();

  const rawIds = params.get("ids");
  if (rawIds !== null) {
    const ids = [...new Set(rawIds.split(",").filter(Boolean))];
    if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => ID_PATTERN.test(id))) {
      return json({ error: "bad_ids" }, 400);
    }
    const [found, totals] = await Promise.all([
      listBoardOrdersByIdsRaw(business.id, ids, filters),
      countBoardOrdersRaw(business.id, filters),
    ]);
    const foundIds = new Set(found.map((order) => order.id));
    return json({
      orders: found.map(toBoardOrderDTO),
      missing: ids.filter((id) => !foundIds.has(id)),
      totals,
    });
  }

  const status = params.get("status");
  if (!status || !(COLUMN_STATUSES as readonly string[]).includes(status)) {
    return json({ error: "bad_status" }, 400);
  }
  const rawAfter = params.get("after");
  const after = decodeBoardCursor(rawAfter);
  if (rawAfter && !after) return json({ error: "bad_cursor" }, 400);

  const [page, totals] = await Promise.all([
    listBoardPageRaw(business.id, status as BoardColumnStatus, filters, { after }),
    countBoardOrdersRaw(business.id, filters),
  ]);
  return json({ orders: page.orders.map(toBoardOrderDTO), hasMore: page.hasMore, totals });
}
