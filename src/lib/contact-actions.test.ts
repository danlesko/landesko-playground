import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptchaToken: vi.fn(async () => true),
}));

import { sendContactEmail } from "@/lib/contact-actions";

const NAMES = [
  "EMAILJS_SERVICE_ID",
  "EMAILJS_TEMPLATE_ID",
  "EMAILJS_PUBLIC_KEY",
  "NEXT_PUBLIC_EMAILJS_SERVICE_ID",
  "NEXT_PUBLIC_EMAILJS_TEMPLATE_ID",
  "NEXT_PUBLIC_EMAILJS_PUBLIC_KEY",
  "EMAILJS_PRIVATE_KEY",
] as const;

const VALID_INPUT = {
  name: "A Sender",
  email: "sender@example.com",
  message: "Hello",
  captchaToken: "a-token",
};

const saved = new Map<string, string | undefined>();

/** Captures the request the action would make, so the values it selected are
 *  observable. `setup.ts` throws on any fetch a test has not stubbed, so this
 *  also keeps the suite off the network. */
function stubFetch() {
  const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>) {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, string>;
}

beforeEach(() => {
  for (const name of NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  // Present in every case below; the cases are about the other three.
  process.env.EMAILJS_PRIVATE_KEY = "private";
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("sendContactEmail EmailJS configuration", () => {
  it("uses the unprefixed variables", async () => {
    process.env.EMAILJS_SERVICE_ID = "service-new";
    process.env.EMAILJS_TEMPLATE_ID = "template-new";
    process.env.EMAILJS_PUBLIC_KEY = "public-new";
    const fetchMock = stubFetch();

    await expect(sendContactEmail(VALID_INPUT)).resolves.toEqual({ ok: true });
    expect(sentBody(fetchMock)).toMatchObject({
      service_id: "service-new",
      template_id: "template-new",
      user_id: "public-new",
    });
  });

  // The reason this PR can ship before the Vercel variables are renamed. Without
  // the fallback, deploying the rename first takes the contact form down until
  // the dashboard catches up.
  it("still works with only the NEXT_PUBLIC_ variables set", async () => {
    process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID = "service-old";
    process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID = "template-old";
    process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY = "public-old";
    const fetchMock = stubFetch();

    await expect(sendContactEmail(VALID_INPUT)).resolves.toEqual({ ok: true });
    expect(sentBody(fetchMock)).toMatchObject({
      service_id: "service-old",
      template_id: "template-old",
      user_id: "public-old",
    });
  });

  it("prefers the unprefixed variable when both are set", async () => {
    process.env.EMAILJS_SERVICE_ID = "service-new";
    process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID = "service-old";
    process.env.EMAILJS_TEMPLATE_ID = "template-new";
    process.env.EMAILJS_PUBLIC_KEY = "public-new";
    const fetchMock = stubFetch();

    await sendContactEmail(VALID_INPUT);

    // Asserted rather than assumed: with the arms the other way round the
    // migration would silently keep using the name being retired.
    expect(sentBody(fetchMock).service_id).toBe("service-new");
  });

  it("reports both spellings when the configuration is absent", async () => {
    const fetchMock = stubFetch();
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      logged.push(args);
    });

    await expect(sendContactEmail(VALID_INPUT)).resolves.toEqual({
      ok: false,
      error: "Failed to send message. Please try again.",
    });

    // Nothing sent, and the log names the variable to set under either spelling.
    expect(fetchMock).not.toHaveBeenCalled();
    const message = logged.flat().join(" ");
    expect(message).toContain("EMAILJS_SERVICE_ID");
    expect(message).toContain("NEXT_PUBLIC_EMAILJS_SERVICE_ID");

    // The values are never logged, only the names. Asserted because the log line
    // is one edit away from interpolating them.
    expect(message).not.toContain("private");
  });
});
