import { describe, it, expect } from "vitest";
import { getAdminLang, getOrderLang, setOrderLang, ORDER_LANG_COOKIE } from "./cookie";
import { setAdminLangAction, setOrderLangAction } from "./actions";
import { runWithCookies, cookies } from "@/test/stubs/next-headers";

describe("getAdminLang / getOrderLang", () => {
  it("defaults to es when no cookie is set", async () => {
    await runWithCookies({}, async () => {
      expect(await getAdminLang()).toBe("es");
      expect(await getOrderLang()).toBe("es");
    });
  });

  it("respects the caller's own default for getOrderLang", async () => {
    await runWithCookies({}, async () => {
      expect(await getOrderLang("en")).toBe("en");
    });
  });

  it("reads back whatever was set", async () => {
    await runWithCookies({}, async () => {
      await setOrderLang("en");
      expect(await getOrderLang()).toBe("en");
    });
  });

  it("ignores a malformed cookie value instead of returning it", async () => {
    await runWithCookies({ [ORDER_LANG_COOKIE]: "fr" }, async () => {
      expect(await getOrderLang()).toBe("es");
    });
  });
});

describe("setAdminLangAction / setOrderLangAction", () => {
  it("sets the admin language cookie", async () => {
    await runWithCookies({}, async () => {
      await setAdminLangAction("en");
      expect(cookies().get("marea-lang")?.value).toBe("en");
    });
  });

  it("sets the order language cookie", async () => {
    await runWithCookies({}, async () => {
      await setOrderLangAction("en");
      expect(await getOrderLang()).toBe("en");
    });
  });
});
