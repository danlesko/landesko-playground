import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

/**
 * These tests drive the route through the *real* `verifyRecaptchaToken`, with
 * only global fetch stubbed. Mocking `@/lib/recaptcha` instead would make the
 * "never echo the upstream error" assertion vacuous, because the leak this
 * guards against originates inside that module's response handling.
 */
const FAKE_SECRET = "s3cr3t-sentinel-do-not-leak";

function stubUpstream(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}

function jsonRequest(body: string): Request {
  return new Request("https://example.test/api/recaptcha", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function readMessage(response: Response): Promise<unknown> {
  const payload: unknown = await response.json();
  return payload && typeof payload === "object" && "message" in payload
    ? payload.message
    : undefined;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.SITE_SECRET_RECAPTCHA;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/recaptcha", () => {
  it("returns 400 for a body that is not JSON", async () => {
    const response = await POST(jsonRequest("not json at all"));

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Invalid request body");
  });

  it("returns 400 when captchaValue is absent", async () => {
    const response = await POST(jsonRequest(JSON.stringify({})));

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Token not found");
  });

  it("returns 400 when captchaValue is not a string", async () => {
    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: 42 })),
    );

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Token not found");
  });

  it("returns 400 for an empty-string token", async () => {
    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "" })),
    );

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Token not found");
  });

  it("makes no upstream request for an unusable token", async () => {
    // Asserting the call count, not just the status: verifyRecaptchaToken
    // swallows fetch errors and returns false, so a 400 alone would not prove
    // that the network was left alone.
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "" })),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns 400 when verification fails", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubUpstream({ success: false, "error-codes": ["invalid-input-response"] });

    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "bad-token" })),
    );

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Failed to verify");
  });

  it("never echoes upstream detail, even when it contains the secret", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    // A hostile or careless upstream body carrying the secret back.
    stubUpstream({
      success: false,
      "error-codes": [`invalid secret ${FAKE_SECRET}`],
      request: `secret=${FAKE_SECRET}&response=bad-token`,
    });

    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "bad-token" })),
    );

    const text = await response.text();
    expect(response.status).toBe(400);
    expect(text).not.toContain(FAKE_SECRET);
    expect(text).not.toContain("invalid-input-response");
    expect(JSON.parse(text)).toEqual({ message: "Failed to verify" });
  });

  it("returns 400 with the same static message when the secret is unset", async () => {
    // Misconfiguration must not be distinguishable from a bad token.
    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "good-token" })),
    );

    expect(response.status).toBe(400);
    await expect(readMessage(response)).resolves.toBe("Failed to verify");
  });

  it("returns 200 when Google accepts the token", async () => {
    process.env.SITE_SECRET_RECAPTCHA = FAKE_SECRET;
    stubUpstream({ success: true });

    const response = await POST(
      jsonRequest(JSON.stringify({ captchaValue: "good-token" })),
    );

    expect(response.status).toBe(200);
    await expect(readMessage(response)).resolves.toBe("Success");
  });
});
