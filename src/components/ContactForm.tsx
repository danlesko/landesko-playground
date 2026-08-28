"use client";
import { useState, ChangeEvent, FormEventHandler, useRef, useId } from "react";
import { Textarea, Input, Button } from "@rewind-ui/core";
import { Email } from "@/lib/definitions";
import ReCAPTCHA from "react-google-recaptcha";
import { sendContactEmail } from "@/lib/contact-actions";
import {
  CAPTCHA_MISSING,
  submitContactEmail,
  type ContactStatus,
} from "@/lib/contactStatus";
import {
  formControlClasses,
  formErrorClasses,
  formLabelClasses,
  formSuccessClasses,
} from "@/components/ui/form";
import { primaryButtonClasses } from "@/components/ui/button";
import { contentColumnClasses } from "@/components/ui/layout";

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

  // `revision` is not display data and is not decoration. A polite live region
  // announces DOM changes, so replacing "Please complete the reCAPTCHA challenge
  // before sending." with the identical string produces no text-node mutation and
  // may announce nothing at all -- which is precisely the case of someone pressing
  // submit again because they did not hear it the first time. Measured, not
  // reasoned: with the message in an unkeyed span, a second press produced zero
  // mutation records.
  //
  // So the message is rendered in a span keyed on this counter, and every
  // committed outcome changes the region -- inserting the span where there was
  // none, or replacing it where there was.
  //
  // This is the one thing `window.alert()` did better than an inline message, and
  // the only reason it needs handling: an alert announces every invocation
  // unconditionally. What the key buys is the DOM change a screen reader needs; it
  // is not a guarantee that every reader's combination speaks it.
  const [status, setStatus] = useState<
    (ContactStatus & { revision: number }) | null
  >(null);

  const report = (next: ContactStatus) =>
    setStatus((previous) => ({
      ...next,
      revision: (previous?.revision ?? 0) + 1,
    }));

  // One value rather than the same condition repeated on four controls, because
  // the failure mode of repeating it is that one control disagrees with the rest
  // and stays live. Two reasons to be inoperable: a send is in flight, or there
  // is no site key and never will be in this environment.
  //
  // Not a `<fieldset disabled>`, which would be the tidier markup: `fieldset`
  // carries `min-inline-size: min-content` in the UA stylesheet, and Tailwind's
  // preflight resets its margin, padding and border but not that, so it can
  // refuse to shrink and push the page wider at narrow widths -- which is a thing
  // this repo has an e2e test about. The form no longer carries a width floor of
  // its own, but `min-content` is the fieldset's floor, so the hazard is the
  // element's, not the form's.
  const formInoperable = isSendingEmail || !recaptchaSiteKey;

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
    //
    // One rough edge in that state, left rather than branched on. If a script or
    // an extension submits a form with no site key, the outcome below asks the
    // reader to complete a challenge the notice above says cannot load. Nothing a
    // reader can do reaches it -- submit and all three fields are disabled, so
    // clicking and Enter are both out -- and a branch for a path only a
    // programmatic submit takes is more code than the confusion is worth.
    const captchaValue = recaptcha.current?.getValue();
    if (!captchaValue) {
      report(CAPTCHA_MISSING);
      return;
    }

    // Cleared only once a send is actually under way, so the previous outcome is
    // not on screen next to a spinner describing a different attempt. Not done
    // above the guard: clearing and re-reporting the same captcha message in one
    // handler batches into a single commit, and the point of `revision` is that
    // such a commit still counts as a change.
    setStatus(null);
    setIsSendingEmail(true);

    try {
      // Every outcome comes back as a value, so there is one place that decides
      // what to say and one place that says it. The previous shape had three
      // notification calls in three branches, which is how a branch ends up
      // reporting nothing.
      //
      // The reCAPTCHA check and the send both happen inside the one server
      // action, so the token is actually bound to the send.
      const outcome = await submitContactEmail(() =>
        sendContactEmail({
          name: userInput.name,
          email: userInput.email,
          message: userInput.message,
          captchaToken: captchaValue,
        }),
      );

      if (outcome.ok) {
        setUserInput({
          name: "",
          email: "",
          message: "",
        });
      }
      report(outcome);
    } finally {
      // Always reset, so a failure cannot leave the button disabled forever.
      recaptcha.current?.reset();
      setIsSendingEmail(false);
    }
  };

  return (
    <form
      className={`text-lg mt-2 ${contentColumnClasses} h-1/2`}
      onSubmit={handleSubmit}
      aria-describedby={
        recaptchaSiteKey ? undefined : `${fieldId}-recaptcha-missing`
      }
    >
      {/* First, not down beside the submit button where the widget used to sit.
          The notice is about the whole form, and a reader who meets it after
          filling three fields has already wasted the effort. It is described on
          the <form> for the same reason: it was originally an aria-describedby on
          the submit button, which is disabled and therefore not focusable, so
          assistive tech would rarely reach it. */}
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
          NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA is not set, so the reCAPTCHA
          challenge cannot load. Email the address above instead.
        </p>
      )}
      <label htmlFor={`${fieldId}-name`} className={formLabelClasses}>
        Name
      </label>
      <Input
        required
        id={`${fieldId}-name`}
        disabled={formInoperable}
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
        disabled={formInoperable}
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
        disabled={formInoperable}
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
        disabled={formInoperable}
        loading={isSendingEmail}
      >
        Send Message
      </Button>
      {/* Always in the tree and empty until there is something to say, and marked
          a live region up front rather than inserted at the moment it gains text:
          the inserted-then-populated shape is the less dependable of the two
          across assistive tech. Same idiom as the message elements in
          CreateBlogForm.

          `polite`, not `assertive`. The reader pressed the button; the answer is
          not an interruption. The rewind-ui Toast this replaces was assertive, but
          it was also gone in three seconds and dismissable only with a mouse, so
          it announced once and could not be recalled.

          Not added to the form's `aria-describedby`: this is the outcome of an
          action, not a standing description of the form. */}
      <p
        aria-live="polite"
        className={status?.ok ? formSuccessClasses : formErrorClasses}
      >
        {status && <span key={status.revision}>{status.message}</span>}
      </p>
    </form>
  );
};

export default ContactForm;
