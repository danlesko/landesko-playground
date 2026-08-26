import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const SITE_KEY_VAR = "NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA";

// The widget is stubbed rather than rendered so the props it is handed are
// observable. It matters because the server markup cannot answer the question
// this file exists to ask: react-google-recaptcha emits a bare <div></div>
// during SSR and puts the sitekey nowhere in it, so "was the widget given an
// empty key" is undecidable from the HTML. The recorded props decide it.
const recaptcha = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
}));

vi.mock("react-google-recaptcha", () => ({
  default: (props: Record<string, unknown>) => {
    recaptcha.calls.push(props);
    return null;
  },
}));

const originalKey = process.env[SITE_KEY_VAR];

/** The component reads the key at module scope, so the environment has to be
 *  set before the import rather than before the render — hence resetModules and
 *  a dynamic import per case rather than a top-level import. */
async function render(key: string | undefined): Promise<string> {
  vi.resetModules();
  recaptcha.calls.length = 0;

  if (key === undefined) delete process.env[SITE_KEY_VAR];
  else process.env[SITE_KEY_VAR] = key;

  const { default: ContactForm } = await import("@/components/ContactForm");
  return renderToStaticMarkup(createElement(ContactForm));
}

/** The submit control's own tag, so `disabled` is read off the button rather
 *  than found anywhere in the document. */
function submitButtonTag(html: string): string {
  const tag = /<button[^>]*type="submit"[^>]*>/.exec(html)?.[0];
  if (!tag) throw new Error("no submit button in the rendered form");
  return tag;
}

/** A named field's own tag. Throws rather than returning undefined, so a
 *  renamed or dropped field fails as "no such field" instead of passing
 *  vacuously the way an absent-element check would. */
function fieldTag(html: string, name: string): string {
  const tag = new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`).exec(
    html,
  )?.[0];
  if (!tag) throw new Error(`no field named ${name} in the rendered form`);
  return tag;
}

const FIELD_NAMES = ["name", "email", "message"] as const;

beforeEach(() => {
  recaptcha.calls.length = 0;
});

afterAll(() => {
  if (originalKey === undefined) delete process.env[SITE_KEY_VAR];
  else process.env[SITE_KEY_VAR] = originalKey;
});

describe("ContactForm with the reCAPTCHA site key configured", () => {
  it("renders the widget, with the real key and no empty-string fallback", async () => {
    await render("a-test-site-key");

    expect(recaptcha.calls).toHaveLength(1);
    expect(recaptcha.calls[0]!.sitekey).toBe("a-test-site-key");
  });

  it("leaves the whole form operable and adds no misconfiguration notice", async () => {
    const html = await render("a-test-site-key");

    expect(submitButtonTag(html)).not.toContain('disabled=""');
    expect(html).not.toContain(SITE_KEY_VAR);

    // The other half of the disabling behaviour. Without this the suite would
    // accept a form that is dead in every environment.
    for (const field of FIELD_NAMES) {
      expect(fieldTag(html, field), field).not.toContain('disabled=""');
    }
  });
});

// Rendering the widget with a blank sitekey is what broke the route: Google's
// api.js throws "Missing required parameters: sitekey" during hydration, the
// throw escapes the component, and React unmounts the whole tree — so /contact
// was replaced by an error screen rather than showing a form with a broken
// captcha. All three cases below are the same defect. The empty string is the
// value the old `|| ""` fallback manufactured out of an unset variable; the
// whitespace case is the one a `KEY= ` typo produces, and it is truthy, so it
// would reach Google unless the key is trimmed.
describe.each([
  { label: "unset", value: undefined },
  { label: "set to an empty string", value: "" },
  { label: "set to whitespace", value: "   " },
])("ContactForm with the site key $label", ({ value }) => {
  it("never constructs the widget", async () => {
    await render(value);

    expect(recaptcha.calls).toHaveLength(0);
  });

  it("disables submit, so nothing can be sent unverified", async () => {
    const html = await render(value);

    expect(submitButtonTag(html)).toContain('disabled=""');
  });

  it("disables the fields too, rather than inviting input that cannot be sent", async () => {
    const html = await render(value);

    for (const field of FIELD_NAMES) {
      expect(fieldTag(html, field), field).toContain('disabled=""');
    }
  });

  it("says which variable is missing, and keeps the rest of the form", async () => {
    const html = await render(value);

    // The variable's name, never a value. This is the difference between a
    // legible misconfiguration and a dead route.
    expect(html).toContain(SITE_KEY_VAR);

    // The page is still usable as a page: the fields survive, which is exactly
    // what the unmount destroyed.
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="message"');
  });

  it("describes the form with the notice, and places it before the fields", async () => {
    const html = await render(value);

    const formTag = /<form[^>]*>/.exec(html)?.[0] ?? "";
    const describedBy = /aria-describedby="([^"]+)"/.exec(formTag)?.[1];

    expect(describedBy).toBeDefined();
    expect(html).toContain(`id="${describedBy}"`);

    // Ahead of the first field, so a reader meets it before spending the
    // effort of filling the form in.
    expect(html.indexOf(`id="${describedBy}"`)).toBeLessThan(
      html.indexOf('name="name"'),
    );

    // Explicitly *not* on the submit button, which is where this started. A
    // disabled button is not focusable, so assistive tech rarely reaches a
    // description hanging off it — the notice concerns the whole form anyway.
    expect(submitButtonTag(html)).not.toContain("aria-describedby");
  });
});
