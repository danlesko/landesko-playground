"use client";

import React from "react";
import ReCAPTCHA from "react-google-recaptcha";

import type { HighScore } from "@/lib/definitions";
import {
  formErrorClasses,
  formInputClasses,
  formLabelClasses,
  formSuccessClasses,
} from "@/components/ui/form";
import { primaryButtonClasses } from "@/components/ui/button";
import { submitHighScore } from "./scoreClient";

/**
 * Offered after a game ends: record this score under a name, or don't.
 *
 * Saving is OPTIONAL and that shapes the whole component. There is always a way out that
 * records nothing, the form never blocks starting another game, and declining is a plain
 * button rather than a corner cross.
 *
 * BELOW the board, not overlaid on it. The leaderboard can sit on the canvas because it is
 * ten short lines; this cannot -- a label, an input, a reCAPTCHA widget (302x78 at its
 * smallest) and two buttons do not fit over a board that is 332px wide on a phone and 122px
 * wide on a landscape one.
 */

/**
 * Trimmed, so a key set to whitespace counts as absent -- `KEY= ` in an env file is a
 * plausible typo and is truthy. Same reasoning as `ContactForm`, which explains it at
 * length: this normalises BLANKNESS only, and a non-blank but wrong key is indistinguishable
 * from a right one here. Google is the only thing that can reject that.
 */
const recaptchaSiteKey =
  process.env.NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA?.trim() || undefined;

type Outcome =
  | { kind: "saved" }
  | { kind: "missed" }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "captcha-missing" };

const MESSAGES: Record<Outcome["kind"], string> = {
  saved: "Your score is on the board.",
  // Phrased as the leaderboard working, because it is. This is a 200 from the server.
  missed: "That score did not make the top ten.",
  rejected: "That submission was refused. Try the challenge again.",
  unavailable: "The leaderboard could not be reached, so nothing was saved.",
  "captcha-missing": "Complete the challenge first.",
};

export type SaveScoreFormProps = {
  score: number;
  /** Called with the board the server returned, so the overlay can show it. */
  onScores: (scores: HighScore[]) => void;
  /** Called when the reader is finished with this panel, saved or not. */
  onDismiss: () => void;
};

const SaveScoreForm = ({ score, onScores, onDismiss }: SaveScoreFormProps) => {
  const captcha = React.useRef<ReCAPTCHA | null>(null);
  // Per instance, so two of these could never emit colliding ids and point one form's label
  // at another form's input.
  const fieldId = React.useId();

  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  // Bumped with every reported outcome, including a repeat of the same one. A live region
  // whose text does not change announces NOTHING, so two rejected attempts in a row would
  // be announced once -- measured elsewhere in this repo. Keying the message on this forces
  // React to replace the node, which counts as a change.
  const [revision, setRevision] = React.useState(0);

  const report = (next: Outcome) => {
    setOutcome(next);
    setRevision((current) => current + 1);
  };

  // Trimmed here as well as on the server, so a name of only spaces does not look enterable.
  const trimmed = name.trim();
  const nameEntered = trimmed.length > 0;
  const settled = outcome?.kind === "saved" || outcome?.kind === "missed";

  const save = async () => {
    // Guards the double submit that PUT's non-idempotency makes expensive: two identical
    // requests record TWO rows, so the button being disabled is not merely cosmetic.
    if (pending || !nameEntered) return;

    const captchaValue = captcha.current?.getValue();
    if (!captchaValue) {
      report({ kind: "captcha-missing" });
      return;
    }

    setPending(true);
    setOutcome(null);
    const result = await submitHighScore({
      name: trimmed,
      score,
      captchaValue,
    });
    setPending(false);

    // A reCAPTCHA token is single-use and expires, so it must be cleared whatever happened.
    // Leaving a spent token in the widget makes the NEXT attempt fail verification for a
    // reason the reader cannot see.
    captcha.current?.reset();

    if (result.status === "saved" || result.status === "missed") {
      onScores(result.scores);
      report({ kind: result.status });
      return;
    }
    report({ kind: result.status });
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-stretch gap-2">
      <p className="text-center text-lg font-semibold">
        Game over — you scored{" "}
        <span className="tabular-nums text-accent">{score}</span>
      </p>

      {!settled && (
        <>
          <label htmlFor={`${fieldId}-name`} className={formLabelClasses}>
            Your name (optional)
          </label>
          <input
            id={`${fieldId}-name`}
            name="playerName"
            type="text"
            // The owner's 32-character limit, enforced here as a convenience and on the
            // server as the rule. `maxLength` alone is not a limit: it stops typing and
            // pasting, and does nothing about a scripted request.
            maxLength={32}
            autoComplete="off"
            disabled={pending}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Enter submits, which is what a single-field form should do. This is not
              // inside a `<form>`: the panel sits within the game's own keyboard region, and
              // a real form here would give Enter a second meaning that reaches the board.
              if (event.key === "Enter" && nameEntered) void save();
            }}
            className={formInputClasses}
          />

          {recaptchaSiteKey ? (
            <div className="flex justify-center">
              <ReCAPTCHA
                theme="dark"
                ref={captcha}
                sitekey={recaptchaSiteKey}
              />
            </div>
          ) : (
            // Same shape as ContactForm's notice, and for the same audience: a contributor
            // or a preview deployment without the key. It names the VARIABLE, never a value.
            // `break-words` because that name is a single unbreakable token wider than a
            // phone's column.
            <p className={`${formErrorClasses} break-words`}>
              Saving is unavailable because
              NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA is not configured. The
              game is unaffected.
            </p>
          )}

          <div className="flex items-center justify-center gap-2">
            {/* APPEARS once a name is entered, rather than being present and disabled. The
                owner asked for the option to save "only after they enter their name", and a
                visible-but-dead button is a weaker reading of that. It also means the
                keyboard cannot reach a control that would refuse. */}
            {nameEntered && recaptchaSiteKey && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={pending}
                className={primaryButtonClasses}
              >
                {pending ? "Saving…" : "Save my score"}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              disabled={pending}
              className="h-10 rounded-lg px-4 text-sm text-slate-300 underline enabled:cursor-pointer disabled:opacity-60"
            >
              {nameEntered ? "Don't save" : "No thanks"}
            </button>
          </div>
        </>
      )}

      {settled && (
        <button
          type="button"
          onClick={onDismiss}
          className={primaryButtonClasses}
        >
          Done
        </button>
      )}

      {/* ALWAYS mounted and empty when there is nothing to say. A live region inserted at the
          same moment it gains text is the less dependable of the two shapes -- the repo's
          form-error pattern makes the same choice for the same reason. */}
      <p
        aria-live="polite"
        aria-atomic="true"
        className={
          outcome?.kind === "saved" ? formSuccessClasses : formErrorClasses
        }
      >
        <span key={revision}>{outcome ? MESSAGES[outcome.kind] : ""}</span>
      </p>
    </div>
  );
};

export default SaveScoreForm;
