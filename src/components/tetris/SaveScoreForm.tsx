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
 * OVERLAID on the board, which it was not at first. Below the board it added height at the
 * exact moment the reader needed to look at it, so on a phone the panel appeared off the
 * bottom of the screen and had to be scrolled to. Overlaying costs no height at all.
 *
 * Fitting it there took two things. The reCAPTCHA widget is `compact` (164x144) rather than
 * normal (302x78), because these boards are TALL AND NARROW -- 332px wide on a phone, 242px
 * at 320px, 122px on a landscape phone -- so width is the scarce dimension and 302px does not
 * fit. And the wrapper that positions it, in `TetrisGame`, may be wider than the board and may
 * scroll, which covers the landscape case. Unlike the leaderboard this must NOT be
 * `pointer-events-none`: it holds a text field and buttons.
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
  // The token lives in state rather than being read from the widget at submit time, because
  // the Save button's disabled state depends on it. `getValue()` is not reactive -- nothing
  // re-renders when the challenge is solved -- so a button gated on it would stay disabled
  // until some unrelated state changed.
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  // Bumped with every reported outcome, including a repeat of the same one. A live region
  // whose text does not change announces NOTHING, so two rejected attempts in a row would
  // be announced once -- measured elsewhere in this repo. Keying the message on this forces
  // React to replace the node, which counts as a change.
  const [revision, setRevision] = React.useState(0);
  // Whether this panel is still on screen when a request comes back. It can genuinely not be:
  // "Play again" stays enabled during a save and unmounts this component, and the pending
  // continuation would then reset a widget that is gone, set state nobody reads, and hand a
  // board to a parent that has moved on.
  const mounted = React.useRef(true);
  React.useEffect(() => {
    // Set on the way IN as well as cleared on the way out. Without the first line this breaks
    // under StrictMode, which mounts, unmounts and remounts: the first cleanup sets it false
    // and nothing ever sets it back, so every save would silently discard its own result in
    // development.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const report = (next: Outcome) => {
    setOutcome(next);
    setRevision((current) => current + 1);
  };

  // Trimmed here as well as on the server, so a name of only spaces does not look enterable.
  const trimmed = name.trim();
  const nameEntered = trimmed.length > 0;
  const captchaSolved = captchaToken !== null && captchaToken.length > 0;
  const settled = outcome?.kind === "saved" || outcome?.kind === "missed";

  const save = async () => {
    // Guards the double submit that PUT's non-idempotency makes expensive: two identical
    // requests record TWO rows, so the button being disabled is not merely cosmetic.
    if (pending || !nameEntered) return;

    // Still checked even though the button is disabled without it: a token can EXPIRE between
    // being solved and being used, and `onExpired` clears it, so this is a state the reader
    // can genuinely reach.
    const captchaValue = captchaToken;
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

    // Everything past this point touches this component or its parent, so it only runs if
    // both are still here. Note what this does NOT fix: the write may have COMMITTED before
    // the reader started a new game, and nothing here can undo that -- see the note on
    // duplicate rows in `high-scores.ts`.
    if (!mounted.current) return;
    setPending(false);

    // A reCAPTCHA token is single-use and expires, so it must be cleared whatever happened.
    // Leaving a spent token in the widget makes the NEXT attempt fail verification for a
    // reason the reader cannot see.
    captcha.current?.reset();
    // The widget was cleared, so the state mirroring it has to be too, or Save would stay
    // enabled holding a token the server has already consumed.
    setCaptchaToken(null);

    if (result.status === "saved" || result.status === "missed") {
      onScores(result.scores);
      report({ kind: result.status });
      return;
    }
    report({ kind: result.status });
  };

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
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
            // Focused on mount, which is a correctness fix rather than a convenience. The
            // board still holds focus when a game ends, and Enter on the board TOGGLES -- so
            // a reader who typed a name and pressed Enter would start a new game and lose the
            // panel. Moving focus here puts Enter on the form. It costs a keyboard appearing
            // on a phone, which is the lesser surprise.
            autoFocus
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
                // `compact` (164x144), not the normal 302x78. See the note at the top of this
                // file: these boards are tall and narrow, so width runs out first.
                size="compact"
                ref={captcha}
                sitekey={recaptchaSiteKey}
                onChange={(token) => setCaptchaToken(token)}
                // A solved token is good for about two minutes, and a game-over panel can sit
                // longer than that. Without these the button would stay enabled and the
                // submission would be refused for a reason the reader cannot see.
                onExpired={() => setCaptchaToken(null)}
                onErrored={() => setCaptchaToken(null)}
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
                // Disabled until the challenge resolves, as well as while a save is in flight.
                // The button APPEARS once a name is entered -- the owner's "only after they
                // enter their name" -- and becomes usable once the captcha resolves, which is
                // the other half they asked for.
                disabled={pending || !captchaSolved}
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
