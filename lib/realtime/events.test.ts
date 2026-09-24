import { describe, it, expect } from "vitest";
import { parseChange } from "./events";

describe("parseChange", () => {
  it("reads the trigger's payload", () => {
    expect(parseChange('{"b":"biz","o":"ord","k":"order","s":"PREPARING"}')).toEqual({
      kind: "order",
      businessId: "biz",
      orderId: "ord",
      status: "PREPARING",
    });
  });

  it("accepts a change with no order or status, like a cash shift", () => {
    expect(parseChange('{"b":"biz","o":null,"k":"cash","s":null}')).toEqual({
      kind: "cash",
      businessId: "biz",
      orderId: null,
      status: null,
    });
  });

  it("drops anything that is not exactly that shape", () => {
    for (const payload of [undefined, "", "not json", "null", "[]", '{"b":"biz"}', '{"b":1,"k":"order"}', '{"b":"biz","k":"reconcile"}', '{"b":"biz","k":"other"}']) {
      expect(parseChange(payload)).toBeNull();
    }
  });
});
