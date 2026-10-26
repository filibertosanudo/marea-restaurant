import { describe, expect, it } from "vitest";
import { makeBusiness } from "@/test/factories";
import { GET } from "@/app/api/tls-allowed/route";

// BUSINESS_ROOT_DOMAIN set before lib/env is first read.
process.env.BUSINESS_ROOT_DOMAIN = "203-0-113-7.sslip.io";

const ask = async (domain: string) => (await GET(new Request(`http://app:3000/api/tls-allowed?domain=${encodeURIComponent(domain)}`))).status;

describe("GET /api/tls-allowed", () => {
  it("allows the root domain and the subdomain of a business that exists", async () => {
    await makeBusiness({ slug: "marea" });
    expect(await ask("203-0-113-7.sslip.io")).toBe(200);
    expect(await ask("Marea.203-0-113-7.sslip.io")).toBe(200);
  });

  it("refuses any other name: an unknown slug, a deeper label, another domain, nothing", async () => {
    await makeBusiness({ slug: "marea" });
    expect(await ask("nadie.203-0-113-7.sslip.io")).toBe(404);
    expect(await ask("a.marea.203-0-113-7.sslip.io")).toBe(404);
    expect(await ask("marea.example.com")).toBe(404);
    expect(await ask("")).toBe(404);
  });
});
