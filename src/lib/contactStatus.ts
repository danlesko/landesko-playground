import type { SendContactEmailResult } from "@/lib/contact-actions";

/** What the contact form has to say about the last thing the reader did.
 *  `ok` selects the colour and nothing else -- both tones render in the same
 *  element, so a success cannot be mistaken for a failure by position. */
export type ContactStatus = { ok: boolean; message: string };

/**
 * In `src/lib/` rather than beside the component, and deliberately. Two reasons:
 *
 *  - It is the only part of the submit outcome that a test in this suite can
 *    reach. Vitest runs `environment: "node"` with no DOM, so the component's
 *    `useState` transitions are unreachable and asserting on them would mean
 *    adding a DOM environment. Extracting the decision as a value makes all three
 *    outcomes testable and leaves exactly one line of wiring uncovered, rather
 *    than three branches.
 *  - `tailwind.config.ts` globs `./src/components/**`, and the extractor reads
 *    comment prose as class candidates, so an explanation like this one emits dead
 *    CSS from a file under that path. `src/lib/` is outside the globs.
 */

export const CAPTCHA_MISSING: ContactStatus = {
  ok: false,
  message: "Please complete the reCAPTCHA challenge before sending.",
};

export const SENT: ContactStatus = {
  ok: true,
  message: "Successfully emailed Dan!",
};

/** The action itself rejected, so there is no server-authored message to show.
 *  Distinct from a `{ok: false}` result, which carries one. */
export const UNREACHABLE: ContactStatus = {
  ok: false,
  message: "Failed to send message. Please try again.",
};

/**
 * Returns on every path rather than rejecting, so the caller has one place to put
 * the answer and no branch where a failure ends up reported nowhere. Not an
 * absolute guarantee: `console.error` below is inside the catch and unguarded, and
 * it can itself throw -- this repo has a case on record where logging a ZodError
 * crashed Node's inspector. Nothing that reaches here is a ZodError, so it is
 * noted rather than defended against.
 *
 * Takes the send as a thunk rather than the form's values, so a test does not
 * have to stand up the server action, `@vercel/postgres` or auth to reach any of
 * these three outcomes.
 */
export async function submitContactEmail(
  send: () => Promise<SendContactEmailResult>,
): Promise<ContactStatus> {
  try {
    const result = await send();
    // The server's own message, verbatim: it distinguishes "check the fields"
    // from "reCAPTCHA validation failed", and collapsing both into one generic
    // string is what makes a form feel broken rather than wrong.
    return result.ok ? SENT : { ok: false, message: result.error };
  } catch (error) {
    console.error("Failed to send message. Please try again later.", error);
    return UNREACHABLE;
  }
}
