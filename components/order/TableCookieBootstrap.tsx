"use client";

import { useEffect } from "react";
import { setTableCookieAction } from "@/lib/cart/actions";

/**
 * Renders nothing — fires once on mount to persist the table this QR code
 * resolved to, so refreshing or navigating within the order flow doesn't
 * lose it. A Server Component page can't write cookies itself, so this is
 * the bridge to the Server Action that can.
 */
export function TableCookieBootstrap({ tableId }: { tableId: string }) {
  useEffect(() => {
    setTableCookieAction(tableId);
  }, [tableId]);

  return null;
}
