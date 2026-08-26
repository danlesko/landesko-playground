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
  // reads these three, so the prefix was never doing anything except marking them
  // as publishable - #14 calls it "an active trap", because the moment a client
  // component reads one they ship to every visitor. There is a guard for that in
  // src/test/server-env-visibility.test.ts, but not needing the prefix at all is
  // better than guarding it.
  //
  // The fallback is what makes this shippable on its own. The rename otherwise
  // has to be a coordinated two-step - add the new names in Vercel for
  // Production, Preview AND Development, only then deploy the code, or the form
  // breaks in between - and that ordering is the reason #14 sat still. Reading
  // both means the deploy can land now and the dashboard change can happen
  // whenever, in either order, with no window where the form is down.
  //
  // It is a deliberate temporary shim with a defined end: once the unprefixed
  // names exist everywhere and the `NEXT_PUBLIC_` ones are deleted, the `??`
  // arms come out. The guard test's list is what will fail and say so.
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
