import { verifyRecaptchaToken } from "@/lib/recaptcha";

export async function POST(req: Request) {
  let token: unknown;

  try {
    const data = await req.json();
    token = data?.captchaValue;
  } catch {
    return Response.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ message: "Token not found" }, { status: 400 });
  }

  const verified = await verifyRecaptchaToken(token);

  if (!verified) {
    // Static message: never echo the upstream error, which can contain the
    // request details and therefore the secret.
    return Response.json({ message: "Failed to verify" }, { status: 400 });
  }

  return Response.json({ message: "Success" }, { status: 200 });
}
