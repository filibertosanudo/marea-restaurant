import { describe, it, expect, vi, afterEach } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createS3Driver } from "./s3";

const config = {
  endpoint: "https://s3.example.com",
  bucket: "marea-media",
  region: "auto",
  accessKeyId: "key",
  secretAccessKey: "secret",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createS3Driver", () => {
  it("put() stores the object and returns its public URL", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const driver = createS3Driver(config);

    const result = await driver.put({ body: Buffer.from("data"), contentType: "image/webp", key: "menu-items/a.webp" });

    expect(result.url).toBe("https://s3.example.com/marea-media/menu-items/a.webp");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("put() uses the CDN hostname instead of the raw endpoint when configured", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const driver = createS3Driver({ ...config, publicHostname: "cdn.marea.test" });

    const result = await driver.put({ body: Buffer.from("data"), contentType: "image/webp", key: "a.webp" });

    expect(result.url).toBe("https://cdn.marea.test/a.webp");
  });

  it("get() returns null for a missing key instead of throwing", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue({ name: "NoSuchKey" });
    const driver = createS3Driver(config);

    expect(await driver.get("missing.webp")).toBeNull();
  });

  it("get() returns the body and content type for an existing key", async () => {
    const stream = Readable.from([Buffer.from("hello")]);
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ Body: stream, ContentType: "text/plain" } as never);
    const driver = createS3Driver(config);

    const file = await driver.get("a.txt");

    expect(file?.body.toString()).toBe("hello");
    expect(file?.contentType).toBe("text/plain");
  });

  it("keyFromUrl() extracts the key from a URL under this driver's own prefix", () => {
    const driver = createS3Driver(config);
    expect(driver.keyFromUrl("https://s3.example.com/marea-media/menu-items/a.webp")).toBe("menu-items/a.webp");
  });

  it("keyFromUrl() returns null for a URL under a different prefix", () => {
    const driver = createS3Driver(config);
    expect(driver.keyFromUrl("https://unrelated.example.com/a.webp")).toBeNull();
  });

  it("list() walks every page via the continuation token", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({
        Contents: [{ Key: "menu-items/a.webp" }],
        IsTruncated: true,
        NextContinuationToken: "token_1",
      } as never)
      .mockResolvedValueOnce({ Contents: [{ Key: "menu-items/b.webp" }], IsTruncated: false } as never);
    const driver = createS3Driver(config);

    const keys = await driver.list("menu-items/");

    expect(keys).toEqual(["menu-items/a.webp", "menu-items/b.webp"]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
