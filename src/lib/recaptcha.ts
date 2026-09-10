// Server-only. The reCAPTCHA secret must never be imported into a client
// component, so nothing in here may be re-exported from a "use client" module.
const SITE_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/**
 * Why a verification did not succeed, which is NOT one thing.
 *
 * `rejected` is the visitor's problem: Google looked at the token and said no, or there was
 * no token. `unavailable` is ours: the secret is not configured, Google answered with an
 * error, or the request never completed. A caller that collapses the two tells a visitor
 * their submission was refused when the truth is that the site is misconfigured.
 */
export type RecaptchaResult =
  | { ok: true }
  | { ok: false; reason: "rejected" | "unavailable" };

/**
 * Verifies a reCAPTCHA token with Google, distinguishing a refusal from an outage.
 *
 * Never surfaces the secret or the underlying error to the caller -- everything specific
 * goes to the server log, and the caller gets one of two reasons.
 */
export async function verifyRecaptcha(token: string): Promise<RecaptchaResult> {
  const secret = process.env.SITE_SECRET_RECAPTCHA;

  if (!secret) {
    console.error("SITE_SECRET_RECAPTCHA is not configured.");
    // OURS, not the visitor's. Telling them their submission was refused would send them
    // round the challenge again for a problem no challenge can fix.
    return { ok: false, reason: "unavailable" };
  }

  if (!token) return { ok: false, reason: "rejected" };

  try {
    // The secret goes in the POST body, never in the query string, so it
    // cannot leak through an error object that echoes the request URL.
    const response = await fetch(SITE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(
        "reCAPTCHA siteverify returned a non-OK status:",
        response.status,
      );
      return { ok: false, reason: "unavailable" };
    }

    const result = (await response.json()) as { success?: boolean };
    // A well-formed answer of "no" is the one case that is genuinely the visitor's.
    return result.success === true
      ? { ok: true }
      : { ok: false, reason: "rejected" };
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * The boolean form, kept because `/api/recaptcha` and the contact flow are built on it and
 * neither distinguishes the two failures -- the contact form's own error copy already covers
 * both, and widening it would be a change to that feature rather than to this one.
 */
export async function verifyRecaptchaToken(token: string): Promise<boolean> {
  return (await verifyRecaptcha(token)).ok;
}
