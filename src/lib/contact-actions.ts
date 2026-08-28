"use server";
import { z } from "zod";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

const EMAILJS_SEND_URL = "https://api.emailjs.com/api/v1.0/email/send";

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(5000),
  captchaToken: z.string().min(1).max(4096),
});

export type SendContactEmailResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Verifies the reCAPTCHA token and only then sends the email. Both steps run
 * on the server so the verification result is actually bound to the send --
 * the browser has no way to reach EmailJS on its own anymore.
 */
export async function sendContactEmail(
  input: unknown,
): Promise<SendContactEmailResult> {
  const parsed = ContactSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please double-check the form fields and try again.",
    };
  }

  const { name, email, message, captchaToken } = parsed.data;

  const verified = await verifyRecaptchaToken(captchaToken);
  if (!verified) {
    return { ok: false, error: "reCAPTCHA validation failed." };
  }

  // Unprefixed first, falling back to the `NEXT_PUBLIC_` names. Only the server
  // reads these three, so the prefix marks them publishable for no reason — #14
  // calls that "an active trap", because a client component reading one would ship
  // it to every visitor.
  //
  // The right-hand arms are the ones doing the work. #14 closed with the rename
  // accepted as-is, and when that was checked (2026-08-28, `vercel env ls`) only
  // the `NEXT_PUBLIC_` names existed. So this is not a migration in progress, and
  // it is not a temporary shim, which is what an earlier version of this comment
  // called it.
  //
  // Keeping the left-hand arms costs nothing and leaves the rename available:
  // add the unprefixed names in Vercel and this file prefers them from the next
  // request, with no code change and no window where the form is down. The arms
  // could then come out, and the per-name check in
  // src/test/server-env-visibility.test.ts would fail naming the lines to delete.
  //
  // One sharp edge: `??` falls back on null and undefined but NOT on an empty
  // string. An unprefixed name set to "" would therefore win over a populated
  // prefixed one. The guard below still catches it — `!serviceId` treats "" as
  // missing and the send is refused — so it fails closed rather than sending with
  // a blank service id.
  const serviceId =
    process.env.EMAILJS_SERVICE_ID ??
    process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId =
    process.env.EMAILJS_TEMPLATE_ID ??
    process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey =
    process.env.EMAILJS_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    // The names of the absent variables, never their values. Each entry names
    // both spellings, because reporting only the unprefixed one would send a
    // reader looking for a variable that may not be the one they configured.
    const missing = (
      [
        ["EMAILJS_SERVICE_ID (or NEXT_PUBLIC_EMAILJS_SERVICE_ID)", serviceId],
        [
          "EMAILJS_TEMPLATE_ID (or NEXT_PUBLIC_EMAILJS_TEMPLATE_ID)",
          templateId,
        ],
        ["EMAILJS_PUBLIC_KEY (or NEXT_PUBLIC_EMAILJS_PUBLIC_KEY)", publicKey],
        ["EMAILJS_PRIVATE_KEY", privateKey],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    console.error(
      `EmailJS is not fully configured; missing: ${missing.join(", ")}`,
    );
    return { ok: false, error: "Failed to send message. Please try again." };
  }

  try {
    // The browser SDK cannot run server-side, so use the REST API with the
    // private key (server-side env var, never exposed to the client).
    const response = await fetch(EMAILJS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey,
        template_params: { name, email, message },
      }),
    });

    if (!response.ok) {
      // Bound the body: it is upstream-controlled and goes straight to our logs.
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      console.error(
        "EmailJS send failed with status:",
        response.status,
        detail,
      );
      return { ok: false, error: "Failed to send message. Please try again." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Failed to send message via EmailJS:", error);
    return { ok: false, error: "Failed to send message. Please try again." };
  }
}
