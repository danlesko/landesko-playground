import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyRecaptchaToken } from "@/lib/recaptcha";

/** Sentinel standing in for the real secret; must never appear in output. */
const FAKE_SECRET = "s3cr3t-sentinel-do-not-leak";
const SITE_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/** Replaces global fetch and returns the spy, so calls can be inspected. */
function stubFetch(impl: (...args: Parameters<typeof fetch>) => Response) {
  const spy = vi.fn(
    async (...args: Parameters<typeof fetch>): Promise<Response> =>
      impl(...args),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.SITE_SECRET_RECAPTCHA;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyRecaptchaToken", () => {
  it("returns false and makes no request when the secret is unset", async () => {
    const fetchSpy = stubFetch(() => jsonResponse({ success: true }));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns false and makes no request for an empty token", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    const fetchSpy = stubFetch(() => jsonResponse({ success: true }));

    await expect(verifyRecaptchaToken("")).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns true when Google reports success", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubFetch(() => jsonResponse({ success: true }));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(true);
  });

  it("returns false when Google reports failure", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubFetch(() => jsonResponse({ success: false }));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
  });

  it("returns false for a truthy but non-boolean success field", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubFetch(() => jsonResponse({ success: "yes" }));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
  });

  it("returns false on a non-OK upstream status", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubFetch(() => jsonResponse({ success: true }, 500));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
  });

  it("returns false when the upstream body is not JSON", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubFetch(() => new Response("<html>nope</html>", { status: 200 }));

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
  });

  it("returns false instead of throwing when fetch rejects", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    const spy = vi.fn(() => Promise.reject(new Error("ENOTFOUND")));
    vi.stubGlobal("fetch", spy);

    await expect(verifyRecaptchaToken("token")).resolves.toBe(false);
  });

  it("sends the secret in the POST body and never in the URL", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    const fetchSpy = stubFetch(() => jsonResponse({ success: true }));

    await verifyRecaptchaToken("token-abc");

    const call = fetchSpy.mock.calls.at(0);
    expect(call).toBeDefined();
    const [url, init] = call ?? [];
    expect(String(url)).toBe(SITE_VERIFY_URL);
    expect(String(url)).not.toContain(FAKE_SECRET);
    expect(init?.method).toBe("POST");

    const body = init?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    const params =
      body instanceof URLSearchParams ? body : new URLSearchParams();
    expect(params.get("secret")).toBe(FAKE_SECRET);
    expect(params.get("response")).toBe("token-abc");
  });

  it("does not let the verification response be cached", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    const fetchSpy = stubFetch(() => jsonResponse({ success: true }));

    await verifyRecaptchaToken("token");

    expect(fetchSpy.mock.calls.at(0)?.[1]?.cache).toBe("no-store");
  });
});
