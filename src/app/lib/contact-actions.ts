"use server";
import { z } from "zod";
import { verifyRecaptchaToken } from "@/src/app/lib/recaptcha";

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

  const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
  const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey || !privateKey) {
    // Log the names of the absent variables, never their values.
    const missing = (
      [
        ["NEXT_PUBLIC_EMAILJS_SERVICE_ID", serviceId],
        ["NEXT_PUBLIC_EMAILJS_TEMPLATE_ID", templateId],
        ["NEXT_PUBLIC_EMAILJS_PUBLIC_KEY", publicKey],
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
      console.error(
        "EmailJS send failed with status:",
        response.status,
        await response.text().catch(() => ""),
      );
      return { ok: false, error: "Failed to send message. Please try again." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Failed to send message via EmailJS:", error);
    return { ok: false, error: "Failed to send message. Please try again." };
  }
}
