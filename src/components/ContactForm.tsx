"use client";
import { useState, ChangeEvent, FormEventHandler, useRef, useId } from "react";
import {
  Textarea,
  Input,
  Button,
  ToastContainer,
  useToast,
} from "@rewind-ui/core";
import { Email } from "@/lib/definitions";
import ReCAPTCHA from "react-google-recaptcha";
import { sendContactEmail } from "@/lib/contact-actions";
import {
  formControlClasses,
  formErrorClasses,
  formLabelClasses,
} from "@/components/ui/form";
import { primaryButtonClasses } from "@/components/ui/button";

// Read once, at module scope, because `NEXT_PUBLIC_*` is substituted by the
// compiler rather than looked up at runtime: this is a build-time constant in
// the client bundle, so setting the variable requires a rebuild to take effect.
//
// The empty-string fallback this replaced was the whole defect. Google's api.js
// rejects an empty sitekey by throwing during hydration, and the throw escapes
// the component, so React unmounted the tree and the whole /contact route was
// replaced by an error screen. The form server-rendered correctly and then
// destroyed itself, which is why curl and any SSR-only check saw a healthy page.
//
// Trimmed, so a variable set to whitespace counts as absent. `KEY= ` in an env
// file is a plausible typo and is truthy, which would have walked straight back
// into the same throw. Note this normalises *blankness* only: a non-blank but
// wrong key is indistinguishable from a right one here, and Google is the only
// thing that can reject it. That case is out of scope and still surfaces as a
// widget that fails to verify rather than as a dead route.
const recaptchaSiteKey =
  process.env.NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA?.trim() || undefined;

const ContactForm = () => {
  const toast = useToast();
  const recaptcha = useRef<ReCAPTCHA | null>(null);
  // Per-instance, so two of these on one page cannot emit colliding ids and
  // silently point the second form's labels at the first form's controls.
  const fieldId = useId();
  const [userInput, setUserInput] = useState<Email>({
    name: "",
    email: "",
    message: "",
  });

  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setUserInput({
      ...userInput,
      [name]: value,
    });
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    // No missing-key branch here on purpose, and "unreachable" would be the
    // wrong reason. A disabled submit blocks clicking and Enter-key implicit
    // submission, but `form.requestSubmit()` and a dispatched submit event both
    // still land here. The reason no branch is needed is that the next line
    // already fails safe in exactly that case: with no widget mounted
    // `getValue()` is undefined, so this returns without sending. The token is
    // verified server-side in `sendContactEmail` regardless, which is where the
    // real boundary is.
    const captchaValue = recaptcha.current?.getValue();
    if (!captchaValue) {
      alert("Please verify the reCAPTCHA!");
      return;
    }

    setIsSendingEmail(true);

    try {
      // The reCAPTCHA check and the send both happen inside this one server
      // action, so the token is actually bound to the send.
      const result = await sendContactEmail({
        name: userInput.name,
        email: userInput.email,
        message: userInput.message,
        captchaToken: captchaValue,
      });

      if (result.ok) {
        setUserInput({
          name: "",
          email: "",
          message: "",
        });
        // All three toasts below pass `description` and no `title` on purpose.
        // rewind-ui renders `description` as a <p> but `title` as an <h4>, and
        // this page's only heading is its <h1>, so adding a title puts an h4
        // directly under it and skips two levels. Nothing would catch that: the
        // heading-order suite does not render this page, and the /contact e2e
        // asserts the <h1> exists rather than checking heading order. Phrased as
        // "not this page" rather than by listing the routes it does cover, so it
        // stays true as that list grows.
        toast.add({
          color: "green",
          tone: "solid",
          iconType: "success",
          description: "Successfully emailed Dan!",
        });
      } else {
        toast.add({
          color: "red",
          tone: "solid",
          iconType: "error",
          description: result.error,
        });
      }
    } catch (error) {
      console.error("Failed to send message. Please try again later.", error);
      toast.add({
        color: "red",
        tone: "solid",
        iconType: "error",
        description: "Failed to send message. Please try again.",
      });
    } finally {
      // Always reset, so a failure cannot leave the button disabled forever.
      recaptcha.current?.reset();
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      <form
        className="text-lg mt-2 lg:min-w-[600px] lg:w-1/2 h-1/2"
        onSubmit={handleSubmit}
        aria-describedby={
          recaptchaSiteKey ? undefined : `${fieldId}-recaptcha-missing`
        }
      >
        {/* First, not down beside the submit button where the widget used to
            sit. The notice is about the whole form, and a reader who meets it
            after filling three fields has already wasted the effort. It is
            described on the <form> for the same reason: it was originally an
            aria-describedby on the submit button, which is disabled and
            therefore not focusable, so assistive tech would rarely reach it. */}
        {!recaptchaSiteKey && (
          // Naming the variable is the point: the reader of this notice is a
          // contributor or a preview deployment that is missing it, and the
          // alternative was a dead route. It is a public key's *name*, never a
          // value.
          //
          // No `aria-live`, unlike the message elements in CreateBlogForm.
          // Those announce a change; this is decided before first paint and
          // never changes, so a live region would have nothing to announce.
          <p id={`${fieldId}-recaptcha-missing`} className={formErrorClasses}>
            This form is unavailable because
            NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA is not set, so the
            reCAPTCHA challenge cannot load. Email the address above instead.
          </p>
        )}
        <label htmlFor={`${fieldId}-name`} className={formLabelClasses}>
          Name
        </label>
        <Input
          required
          id={`${fieldId}-name`}
          disabled={isSendingEmail}
          value={userInput.name}
          type="text"
          name="name"
          color="purple"
          className={`${formControlClasses} mt-1`}
          onChange={handleChange}
        />
        <label htmlFor={`${fieldId}-email`} className={formLabelClasses}>
          Email
        </label>
        <Input
          required
          id={`${fieldId}-email`}
          disabled={isSendingEmail}
          value={userInput.email}
          type="email"
          name="email"
          color="purple"
          className={`${formControlClasses} mt-1`}
          onChange={handleChange}
        />
        <label htmlFor={`${fieldId}-message`} className={formLabelClasses}>
          Message
        </label>
        <Textarea
          required
          id={`${fieldId}-message`}
          disabled={isSendingEmail}
          className={`${formControlClasses} mt-1`}
          tone="solid"
          color="purple"
          placeholder="Ask me anything!"
          name="message"
          value={userInput.message}
          onChange={handleChange}
        />
        {recaptchaSiteKey && (
          <ReCAPTCHA theme="dark" ref={recaptcha} sitekey={recaptchaSiteKey} />
        )}
        <Button
          variant="primary"
          type="submit"
          className={`mt-1 font-bold ${primaryButtonClasses}`}
          disabled={isSendingEmail || !recaptchaSiteKey}
          loading={isSendingEmail}
        >
          Send Message
        </Button>
      </form>
      <ToastContainer />
    </>
  );
};

export default ContactForm;
