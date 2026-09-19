-- Real-time change feed (module 16, phase 3). Hand-written: Prisma has no way
-- to express triggers, the same reason the reservation EXCLUDE constraint and
-- the open-cash-session partial index are written by hand.
--
-- One function, parameterised by the kind of change, and one CREATE TRIGGER per
-- table. Adding a fifth source is one more CREATE TRIGGER, provided the table
-- has a "businessId", an "orderId" or a "cashSessionId" to resolve the
-- business from.
--
-- The payload is deliberately tiny (about 120 bytes; pg_notify's limit is 8000):
--   b  business id   o  order id or null   k  kind   s  status or null
-- Listeners re-read what changed through the normal, authorised render; the
-- notification never carries order data.
--
-- pg_notify is transactional: a rolled-back transaction notifies nobody, and
-- the notification goes out at commit. Notifications sent while no session is
-- listening are gone for good, which is why the app runs a recovery sweep after
-- every reconnect (lib/realtime/listen-source.ts).
--
-- Revert with:
--   DROP TRIGGER marea_realtime_order_status_event ON "OrderStatusEvent";
--   DROP TRIGGER marea_realtime_payment ON "Payment";
--   DROP TRIGGER marea_realtime_cash_session ON "CashSession";
--   DROP TRIGGER marea_realtime_cash_movement ON "CashMovement";
--   DROP FUNCTION marea_notify_change();

CREATE FUNCTION marea_notify_change() RETURNS trigger AS $$
DECLARE
  changed  jsonb := to_jsonb(NEW);
  business text  := changed ->> 'businessId';
  order_id text  := changed ->> 'orderId';
BEGIN
  IF business IS NULL AND order_id IS NOT NULL THEN
    SELECT "businessId" INTO business FROM "Order" WHERE id = order_id;
  END IF;
  IF business IS NULL AND changed ? 'cashSessionId' THEN
    SELECT "businessId" INTO business FROM "CashSession" WHERE id = changed ->> 'cashSessionId';
  END IF;

  IF business IS NOT NULL THEN
    PERFORM pg_notify(
      'marea_realtime',
      jsonb_build_object(
        'b', business,
        'o', order_id,
        'k', TG_ARGV[0],
        's', coalesce(changed ->> 'toStatus', changed ->> 'status')
      )::text
    );
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Immutable status log: INSERT only, which is why it is the primary signal.
CREATE TRIGGER marea_realtime_order_status_event
  AFTER INSERT ON "OrderStatusEvent"
  FOR EACH ROW EXECUTE FUNCTION marea_notify_change('order');

-- A cash collection or a card webhook changes a Payment without adding an
-- OrderStatusEvent, so INSERT alone would miss it.
CREATE TRIGGER marea_realtime_payment
  AFTER INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION marea_notify_change('payment');

-- The till widget on the board: opening and closing a shift.
CREATE TRIGGER marea_realtime_cash_session
  AFTER INSERT OR UPDATE ON "CashSession"
  FOR EACH ROW EXECUTE FUNCTION marea_notify_change('cash');

CREATE TRIGGER marea_realtime_cash_movement
  AFTER INSERT ON "CashMovement"
  FOR EACH ROW EXECUTE FUNCTION marea_notify_change('cash');
