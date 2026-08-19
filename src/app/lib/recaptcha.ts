// Server-only. The reCAPTCHA secret must never be imported into a client
// component, so nothing in here may be re-exported from a "use client" module.
const SITE_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

/**
 * Verifies a reCAPTCHA token with Google. Returns false for any failure
 * (missing config, network error, rejected token) and never surfaces the
 * secret or the underlying error to the caller.
 */
export async function verifyRecaptchaToken(token: string): Promise<boolean> {
  const secret = process.env.SITE_SECRET_RECAPTCHA;

  if (!secret) {
    console.error("SITE_SECRET_RECAPTCHA is not configured.");
    return false;
  }

  if (!token) return false;

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
      return false;
    }

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("reCAPTCHA verification failed:", error);
    return false;
  }
}
