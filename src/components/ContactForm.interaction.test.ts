// @vitest-environment jsdom

import { createElement, type Ref } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SendContactEmailResult } from "@/lib/contact-actions";
import { SENT, UNREACHABLE } from "@/lib/contactStatus";

/**
 * The only test in this repo that drives a real submit. Everything else renders
 * statically in Node, which cannot reach `handleSubmit` at all -- so the line that
 * puts an outcome on screen was deletable with the whole suite green. That is what
 * this file exists to stop, and it is why it carries the environment docblock
 * above rather than the project-wide `environment: "node"`.
 *
 * Scoped to one file on purpose. A DOM is slower and, more importantly, jsdom is
 * not a browser: layout, focus order and live-region announcement are all absent
 * or approximated. Claims about those belong in e2e/, and nothing here makes one.
 * What jsdom does give faithfully is React's own behaviour -- which handler ran,
 * what state it set, what text ended up in which element.
 */

const SITE_KEY_VAR = "NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA";
const TOKEN = "a-captcha-token";

const action = vi.hoisted(() => ({
  sendContactEmail:
    vi.fn<(input: unknown) => Promise<SendContactEmailResult>>(),
}));

vi.mock("@/lib/contact-actions", () => action);

/** Stands in for the widget and, unlike the stub in ContactForm.test.ts, answers
 *  `getValue()`. Without a token the form returns at its captcha guard, which is
 *  the one path the browser suite already covers -- every case here needs the
 *  branch beyond it. `reset` is recorded because the component's `finally` calls
 *  it, and a form that never resets its captcha cannot be submitted twice. */
const widget = vi.hoisted(() => ({
  token: null as string | null,
  resets: 0,
}));

vi.mock("react-google-recaptcha", () => ({
  default: ({ ref }: { ref?: Ref<unknown> }) => {
    if (ref && typeof ref === "object") {
      (ref as { current: unknown }).current = {
        getValue: () => widget.token,
        reset: () => {
          widget.resets += 1;
        },
      };
    }
    return null;
  },
}));

const originalKey = process.env[SITE_KEY_VAR];

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  // React's `act` refuses to run without this, and says so.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  process.env[SITE_KEY_VAR] = "a-test-site-key";
  widget.token = TOKEN;
  widget.resets = 0;
  action.sendContactEmail.mockReset();

  container = document.createElement("div");
  // Attached to the document, not floating: React 19 binds its event listeners on
  // the root container, and an event dispatched inside a detached tree still
  // reaches it -- but focus, `:disabled` matching and anything reading layout do
  // not behave the same way off-document.
  document.body.append(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env[SITE_KEY_VAR];
  else process.env[SITE_KEY_VAR] = originalKey;
});

/** The component reads the site key at module scope, so the import has to happen
 *  after the environment is set. */
async function mount(): Promise<void> {
  vi.resetModules();
  const { default: ContactForm } = await import("@/components/ContactForm");
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(ContactForm));
  });
}

const form = () => {
  const element = container.querySelector("form");
  if (!element) throw new Error("no form rendered");
  return element;
};

const field = (name: string) => {
  const element = container.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(`[name="${name}"]`);
  if (!element) throw new Error(`no field named ${name}`);
  return element;
};

const outcome = () => {
  const element = container.querySelector('[aria-live="polite"]');
  if (!element) throw new Error("no live region rendered");
  return element;
};

/** React tracks the last value it wrote and drops an input event that does not
 *  differ from it, so assigning `.value` and dispatching is not enough -- the
 *  prototype's own setter has to be used so React's tracker sees the change. */
function type(name: string, value: string): void {
  const element = field(name);
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("no value setter on the element prototype");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Dispatched rather than `requestSubmit()`, which runs constraint validation:
 *  three `required` fields would block a submit in the cases that deliberately
 *  leave them empty. React's onSubmit sees either one identically. */
async function submit(): Promise<void> {
  await act(async () => {
    form().dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function fillAndSubmit(): Promise<void> {
  await act(async () => {
    type("name", "Ada");
    type("email", "ada@example.com");
    type("message", "Hello");
  });
  await submit();
}

describe("a contact submit that reaches the server action", () => {
  it("hands the action the three fields and the captcha token, and nothing else", async () => {
    action.sendContactEmail.mockResolvedValue({ ok: true });
    await mount();
    await fillAndSubmit();

    expect(action.sendContactEmail).toHaveBeenCalledTimes(1);
    const call = action.sendContactEmail.mock.calls[0]!;
    // The argument list's length too. Asserting only `call[0]` has let a third
    // leaking argument through in this repo before.
    expect(call).toHaveLength(1);
    expect(call[0]).toStrictEqual({
      name: "Ada",
      email: "ada@example.com",
      message: "Hello",
      captchaToken: TOKEN,
    });
  });

  it("shows the success message", async () => {
    action.sendContactEmail.mockResolvedValue({ ok: true });
    await mount();
    await fillAndSubmit();

    expect(outcome().textContent).toBe(SENT.message);
  });

  it("clears the fields on success, so a second send is not a duplicate", async () => {
    action.sendContactEmail.mockResolvedValue({ ok: true });
    await mount();
    await fillAndSubmit();

    expect(field("name").value).toBe("");
    expect(field("email").value).toBe("");
    expect(field("message").value).toBe("");
  });

  it("shows the server's own message when the action reports a failure", async () => {
    action.sendContactEmail.mockResolvedValue({
      ok: false,
      error: "reCAPTCHA validation failed.",
    });
    await mount();
    await fillAndSubmit();

    expect(outcome().textContent).toBe("reCAPTCHA validation failed.");
  });

  it("keeps what the reader typed when the send failed", async () => {
    action.sendContactEmail.mockResolvedValue({ ok: false, error: "nope" });
    await mount();
    await fillAndSubmit();

    // Clearing on a failure would throw away a message the reader has to retype,
    // which is the failure mode this repo has already hit once via
    // `requestFormReset`.
    expect(field("message").value).toBe("Hello");
  });

  it("shows its own message when the action rejects", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    action.sendContactEmail.mockRejectedValue(new Error("network is down"));
    await mount();
    await fillAndSubmit();

    expect(outcome().textContent).toBe(UNREACHABLE.message);
    expect(log).toHaveBeenCalled();
  });

  it("re-enables the form and resets the captcha whichever way the send went", async () => {
    action.sendContactEmail.mockRejectedValue(new Error("network is down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();
    await fillAndSubmit();

    // A failure that left these two undone would leave the form permanently dead
    // with an error message and no way to retry -- the `finally` block's whole job.
    expect(field("name").disabled).toBe(false);
    expect(widget.resets).toBe(1);
  });

  it("clears the previous outcome while the next send is in flight", async () => {
    let release: (result: SendContactEmailResult) => void = () => {};
    action.sendContactEmail
      .mockResolvedValueOnce({ ok: false, error: "first attempt failed" })
      .mockImplementationOnce(
        () =>
          new Promise<SendContactEmailResult>((resolve) => (release = resolve)),
      );

    await mount();
    await fillAndSubmit();
    expect(outcome().textContent).toBe("first attempt failed");

    await fillAndSubmit();
    // Mid-flight: the old failure must not sit next to a spinner describing a
    // different attempt.
    expect(outcome().textContent).toBe("");

    await act(async () => release({ ok: true }));
    expect(outcome().textContent).toBe(SENT.message);
  });
});

describe("a contact submit with no captcha token", () => {
  it("reports the captcha and never calls the action", async () => {
    action.sendContactEmail.mockResolvedValue({ ok: true });
    widget.token = null;
    await mount();
    await fillAndSubmit();

    expect(outcome().textContent).toBe(
      "Please complete the reCAPTCHA challenge before sending.",
    );
    expect(action.sendContactEmail).not.toHaveBeenCalled();
  });

  it("keeps the fields, so the guard costs the reader nothing", async () => {
    widget.token = null;
    await mount();
    await fillAndSubmit();

    expect(field("message").value).toBe("Hello");
  });
});
