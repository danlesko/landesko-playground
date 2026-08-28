import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAPTCHA_MISSING,
  SENT,
  UNREACHABLE,
  submitContactEmail,
} from "@/lib/contactStatus";
import type { SendContactEmailResult } from "@/lib/contact-actions";

/** Silenced rather than left to print, but asserted on: the catch branch's only
 *  other observable effect is this log, and a spy that is never checked would let
 *  the diagnostic be deleted. */
const errorLog = () => vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  vi.restoreAllMocks();
});

const resolving = (result: SendContactEmailResult) =>
  vi.fn<() => Promise<SendContactEmailResult>>().mockResolvedValue(result);

describe("the three contact-form outcomes are distinguishable", () => {
  // Every case below asserts a *specific* message, so if two of these collapsed
  // into one string the assertions would still pass while the form said the wrong
  // thing. This is the check that keeps them honest.
  it("gives each outcome its own non-empty message", () => {
    const messages = [
      SENT.message,
      UNREACHABLE.message,
      CAPTCHA_MISSING.message,
    ];

    for (const message of messages) expect(message.length).toBeGreaterThan(0);
    expect(new Set(messages).size).toBe(messages.length);
  });

  // `ok` is what picks the colour, so a success that reports `false` renders a
  // successful send in the danger colour.
  it("marks only the success as ok", () => {
    expect(SENT.ok).toBe(true);
    expect(UNREACHABLE.ok).toBe(false);
    expect(CAPTCHA_MISSING.ok).toBe(false);
  });
});

describe("submitContactEmail", () => {
  it("reports the success when the action reports one", async () => {
    const send = resolving({ ok: true });

    await expect(submitContactEmail(send)).resolves.toEqual(SENT);
  });

  it("sends exactly once", async () => {
    const send = resolving({ ok: true });

    await submitContactEmail(send);

    // A retry here would mean a second email for one press of the button.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("shows the server's own message rather than a generic failure", async () => {
    // Deliberately unlike any of the three constants: the assertion is that this
    // string survives, not merely that something failed. Collapsing a returned
    // error into UNREACHABLE loses the difference between "check the form fields"
    // and "reCAPTCHA validation failed", which is the difference between a reader
    // who can fix it and one who cannot.
    const send = resolving({
      ok: false,
      error: "reCAPTCHA validation failed.",
    });

    // toStrictEqual, so the returned shape is exactly a ContactStatus: passing the
    // action's result straight through would carry an `error` key as well and
    // toEqual would accept it.
    await expect(submitContactEmail(send)).resolves.toStrictEqual({
      ok: false,
      message: "reCAPTCHA validation failed.",
    });
  });

  it("falls back to its own message when the action rejects", async () => {
    const log = errorLog();
    const boom = new Error("network is down");
    const send = vi
      .fn<() => Promise<SendContactEmailResult>>()
      .mockRejectedValue(boom);

    // Resolving rather than rejecting is the contract the form depends on: it has
    // no catch of its own, so a rejection here would leave the reader with a form
    // that went quiet.
    await expect(submitContactEmail(send)).resolves.toEqual(UNREACHABLE);
    expect(log).toHaveBeenCalledWith(expect.any(String), boom);
  });
});
