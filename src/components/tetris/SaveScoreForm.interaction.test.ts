// @vitest-environment jsdom

import { createElement, act, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SubmitResult } from "@/components/tetris/scoreClient";

/**
 * The save panel, driven for real.
 *
 * Rendering it statically in Node cannot reach `save()` at all, so every line that decides
 * what happens after a submission -- the captcha guard, the double-submit guard, the reset,
 * which message appears -- would be deletable with the rest of the suite green. That is what
 * this file is for, and why it carries the environment docblock above rather than the
 * project-wide `environment: "node"`.
 *
 * jsdom is not a browser. Nothing here claims anything about layout, focus order or whether a
 * live region is actually ANNOUNCED -- those belong in `e2e/`. What jsdom gives faithfully is
 * React's own behaviour: which handler ran, what state it set, what text landed where.
 */

const SITE_KEY_VAR = "NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA";
const TOKEN = "a-captcha-token";

const client = vi.hoisted(() => ({
  submitHighScore: vi.fn<(input: unknown) => Promise<SubmitResult>>(),
}));

vi.mock("@/components/tetris/scoreClient", () => client);

/**
 * Stands in for the widget, reporting its token the way the real one does -- through
 * `onChange`, not through `getValue()`. That distinction is the point: the Save button's
 * disabled state depends on the token, and `getValue()` is not reactive, so the component reads
 * it from the callback and holds it in state.
 *
 * The callback is captured rather than invoked during render; `solve()` and `expire()` below
 * fire it from inside `act`. `reset` is counted, because a panel that never resets its captcha
 * cannot be submitted twice and the token is single-use.
 */
const widget = vi.hoisted(() => ({
  token: null as string | null,
  resets: 0,
  onChange: null as null | ((token: string | null) => void),
}));

vi.mock("react-google-recaptcha", () => ({
  default: ({
    ref,
    onChange,
  }: {
    ref?: Ref<unknown>;
    onChange?: (token: string | null) => void;
  }) => {
    if (ref && typeof ref === "object") {
      (ref as { current: unknown }).current = {
        getValue: () => widget.token,
        reset: () => {
          widget.resets += 1;
        },
      };
    }
    widget.onChange = onChange ?? null;
    return null;
  },
}));

let container: HTMLDivElement;
let root: Root;
const dismissals = vi.fn();
const boards = vi.fn();

const mount = async (score = 900): Promise<void> => {
  const { default: SaveScoreForm } = await import(
    "@/components/tetris/SaveScoreForm"
  );
  await act(async () => {
    root.render(
      createElement(SaveScoreForm, {
        score,
        onScores: boards,
        onDismiss: dismissals,
      }),
    );
  });
};

const button = (label: string | RegExp): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll("button")).find((element) =>
    typeof label === "string"
      ? element.textContent?.includes(label)
      : label.test(element.textContent ?? ""),
  );

const input = (): HTMLInputElement =>
  container.querySelector("input")! as HTMLInputElement;

/**
 * React tracks the last value it wrote and DROPS an input event whose value matches it, so
 * assigning `.value` and dispatching is not enough -- the change never reaches `onChange` and
 * the component behaves as though nothing was typed. Going through the prototype's setter is
 * what makes React see it. `ContactForm.interaction.test.ts` documents the same trap, which is
 * where the fix came from after walking into it here.
 */
const type = async (value: string): Promise<void> => {
  const field = input();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) throw new Error("no value setter on the element prototype");
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const click = async (element: Element | undefined): Promise<void> => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Completes the challenge, the way a visitor ticking the box does. */
const solve = async (): Promise<void> => {
  await act(async () => {
    widget.onChange?.(widget.token);
  });
};

/** The token timing out, which the real widget reports as `onChange(null)`. */
const expire = async (): Promise<void> => {
  await act(async () => {
    widget.onChange?.(null);
  });
};

const liveText = (): string =>
  container.querySelector('[aria-live="polite"]')?.textContent ?? "";

beforeEach(() => {
  // React refuses to run `act` without this, and the failure is a warning plus a broken
  // render rather than a clear error. `ContactForm.interaction.test.ts` sets it the same way.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  process.env[SITE_KEY_VAR] = "a-site-key";
  widget.token = TOKEN;
  widget.resets = 0;
  widget.onChange = null;
  client.submitHighScore.mockResolvedValue({ status: "saved", scores: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete process.env[SITE_KEY_VAR];
  vi.clearAllMocks();
});

describe("offering the save", () => {
  it("shows no way to save until a name is entered", async () => {
    // The owner asked for the option to save "only after they enter their name". A present
    // but disabled button is a weaker reading, and would let the keyboard reach a control
    // that refuses.
    await mount();
    expect(button("Save my score")).toBeUndefined();

    await type("Ada");
    expect(button("Save my score")).toBeDefined();
  });

  it("does not count whitespace as a name", async () => {
    await mount();
    await type("   ");
    expect(button("Save my score")).toBeUndefined();
  });

  it("always offers a way out that records nothing", async () => {
    // Saving is optional, so declining must never be conditional on anything.
    await mount();
    expect(button(/No thanks/)).toBeDefined();

    await type("Ada");
    expect(button(/Don't save/)).toBeDefined();

    await click(button(/Don't save/));
    expect(dismissals).toHaveBeenCalled();
    expect(client.submitHighScore).not.toHaveBeenCalled();
  });

  it("limits the name to 32 characters in the field itself", async () => {
    await mount();
    expect(input().maxLength).toBe(32);
  });
});

describe("submitting", () => {
  it("sends the trimmed name, the score and the captcha token", async () => {
    await mount(1234);
    await type("  Ada  ");
    await solve();
    await click(button("Save my score"));

    expect(client.submitHighScore).toHaveBeenCalledWith({
      name: "Ada",
      score: 1234,
      captchaValue: TOKEN,
    });
  });

  it("keeps Save disabled until the challenge resolves", async () => {
    // The owner asked for this directly. A name alone is not enough: the button appears once a
    // name is entered and stays inert until the captcha reports a token.
    await mount();
    await type("Ada");
    expect(button("Save my score")?.disabled).toBe(true);

    await solve();
    expect(button("Save my score")?.disabled).toBe(false);
  });

  it("disables Save again when the token expires", async () => {
    // A solved token is good for about two minutes and a game-over panel can sit longer. If the
    // button stayed enabled the submission would be refused for a reason the reader cannot see.
    await mount();
    await type("Ada");
    await solve();
    await expire();

    expect(button("Save my score")?.disabled).toBe(true);
  });

  it("refuses to submit if the token vanishes between solving and clicking", async () => {
    // Reachable rather than theoretical: `onExpired` fires while the panel is open, and the
    // click may already be in flight. The guard inside `save` is what covers it.
    await mount();
    await type("Ada");
    await solve();
    await expire();
    await click(button("Save my score"));

    expect(client.submitHighScore).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "saved", scores: [] }],
    [{ status: "missed", scores: [] }],
    [{ status: "rejected" }],
    [{ status: "unavailable" }],
  ] as Array<[SubmitResult]>)(
    "resets the captcha after %o, not only after a failure",
    async (result) => {
      // The token is single-use. Leaving a spent one in the widget makes the NEXT attempt fail
      // verification for a reason the reader cannot see. The first version of this test only
      // exercised `unavailable`, so resetting on that outcome alone would have passed it.
      client.submitHighScore.mockResolvedValue(result);
      await mount();
      await type("Ada");
      await solve();
      await click(button("Save my score"));

      expect(widget.resets).toBe(1);
    },
  );

  it("cannot be submitted twice by clicking twice", async () => {
    // PUT is not idempotent here -- two identical requests record two rows -- so this is a
    // correctness guard, not a nicety.
    let release: (value: SubmitResult) => void = () => {};
    client.submitHighScore.mockImplementation(
      () =>
        new Promise<SubmitResult>((resolve) => {
          release = resolve;
        }),
    );

    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));
    // Mid-flight: the control reports itself busy and a second press does nothing.
    expect(button(/Saving/)?.disabled).toBe(true);
    await click(button(/Saving/));
    expect(client.submitHighScore).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ status: "saved", scores: [] });
    });
  });
});

describe("reporting the outcome", () => {
  const outcomes: Array<[SubmitResult, RegExp]> = [
    [{ status: "saved", scores: [] }, /on the board/i],
    [{ status: "missed", scores: [] }, /did not make the top ten/i],
    [{ status: "rejected" }, /refused/i],
    [{ status: "unavailable" }, /could not be reached/i],
  ];

  it.each(outcomes)("distinguishes %o", async (result, expected) => {
    // Four outcomes, four messages. Collapsing "did not make the top ten" into a failure
    // would be a lie -- the leaderboard worked -- and collapsing a refused submission into an
    // unreachable one would tell the reader to retry something that cannot succeed.
    client.submitHighScore.mockResolvedValue(result);
    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));

    expect(liveText()).toMatch(expected);
  });

  it("hands the returned board up so the leaderboard can show it", async () => {
    client.submitHighScore.mockResolvedValue({
      status: "saved",
      scores: [{ name: "Ada", score: 900 }],
    });
    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));

    expect(boards).toHaveBeenCalledWith([{ name: "Ada", score: 900 }]);
  });

  it("closes the form once the score is settled, leaving only a way out", async () => {
    // Settled means recorded or judged too low: either way there is nothing left to submit,
    // and leaving the field on screen invites a second identical row.
    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));

    expect(container.querySelector("input")).toBeNull();
    expect(button("Done")).toBeDefined();
  });

  it("keeps the form open after a failure, so the attempt can be repeated", async () => {
    client.submitHighScore.mockResolvedValue({ status: "unavailable" });
    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));

    expect(container.querySelector("input")).not.toBeNull();
    expect(button("Save my score")).toBeDefined();
  });

  it("announces a repeated identical outcome again", async () => {
    // A live region whose text does not change announces nothing, so two failures in a row
    // would be announced once. The message is keyed on a revision counter for exactly this.
    client.submitHighScore.mockResolvedValue({ status: "unavailable" });
    await mount();
    await type("Ada");
    await solve();
    await click(button("Save my score"));
    const first = container.querySelector('[aria-live="polite"] span');
    // Solved AGAIN, because a completed attempt clears the token -- which is correct, the
    // server has consumed it -- so a second submission needs a second challenge.
    await solve();
    await click(button("Save my score"));
    const second = container.querySelector('[aria-live="polite"] span');

    expect(first).not.toBe(second);
    expect(second?.textContent).toMatch(/could not be reached/i);
  });
});

describe("without a configured site key", () => {
  it("says saving is unavailable and offers no save control", async () => {
    // A preview deployment or a fresh checkout. The game must be unaffected, so this is a
    // notice rather than a dead button.
    delete process.env[SITE_KEY_VAR];
    await mount();
    await type("Ada");

    expect(button("Save my score")).toBeUndefined();
    expect(container.textContent).toContain(SITE_KEY_VAR);
    expect(button(/Don't save/)).toBeDefined();
  });
});
