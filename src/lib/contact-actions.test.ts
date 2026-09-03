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

/**
 * What the schema does to the reader's input before it is sent, which had no
 * coverage at all until #126 — every existing fixture is already clean.
 *
 * The gap was not theoretical. zod 4 deprecates `z.string().email()` in favour of
 * the top-level `z.email()`, and the obvious rewrite, `z.email().trim()`, is
 * wrong: v4 runs checks in the order they are attached, so the format check would
 * see untrimmed input and REJECT "  a@b.com  " where the previous
 * `.trim().email()` trimmed it and accepted. Measured both ways. A trailing space
 * is exactly what someone pastes into an email field, so that would have been a
 * real regression shipped behind a green suite.
 *
 * `contact-actions.ts` uses `z.string().trim().pipe(z.email().max(254))` instead,
 * and these assert the two halves of that: it is accepted, and what leaves the
 * process is the trimmed value rather than the raw one.
 */
describe("what the contact schema does to the input", () => {
  beforeEach(() => {
    process.env.EMAILJS_SERVICE_ID = "service";
    process.env.EMAILJS_TEMPLATE_ID = "template";
    process.env.EMAILJS_PUBLIC_KEY = "public";
    process.env.EMAILJS_PRIVATE_KEY = "private";
  });

  it("accepts an address with surrounding whitespace and sends it trimmed", async () => {
    const fetchMock = stubFetch();

    await expect(
      sendContactEmail({ ...VALID_INPUT, email: "  sender@example.com  " }),
    ).resolves.toEqual({ ok: true });

    // The OUTBOUND value, not just that the action succeeded: a schema that
    // accepted the padded address without trimming it would satisfy a
    // success-only assertion and put the padding in the reply-to field.
    expect(sentBody(fetchMock).template_params).toMatchObject({
      email: "sender@example.com",
    });
  });

  it("trims the name and the message too", async () => {
    const fetchMock = stubFetch();

    await expect(
      sendContactEmail({
        ...VALID_INPUT,
        name: "  A Sender  ",
        message: "  Hello  ",
      }),
    ).resolves.toEqual({ ok: true });

    expect(sentBody(fetchMock).template_params).toEqual({
      name: "A Sender",
      email: "sender@example.com",
      message: "Hello",
    });
  });

  it("still rejects an address that is not one, and sends nothing", async () => {
    // The control. Without it, a schema that trimmed and validated nothing would
    // pass both tests above.
    const fetchMock = stubFetch();

    await expect(
      sendContactEmail({ ...VALID_INPUT, email: "  not-an-email  " }),
    ).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a message that is only whitespace", async () => {
    // `min(1)` runs after `trim()`, so this is empty by the time it is checked.
    const fetchMock = stubFetch();

    await expect(
      sendContactEmail({ ...VALID_INPUT, message: "   " }),
    ).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
