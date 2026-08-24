import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions", () => ({ createBlog: vi.fn() }));
vi.mock("@/lib/contact-actions", () => ({ sendContactEmail: vi.fn() }));

import ContactForm from "@/components/ContactForm";
import CreateBlogPage from "@/app/blog/create/page";

/**
 * These assert on *rendered markup*, not on the element tree, and that is the
 * point. `<Input id="x">` is a rewind-ui component: a tree walk would only
 * confirm the prop was passed, while the association depends on the library
 * forwarding `id` onto the real control rather than onto a wrapper. Rendering
 * is what makes that observable, so a library upgrade that stopped forwarding
 * `id` fails here.
 *
 * Deliberately NOT asserted by accessible name. `placeholder` is a fallback in
 * the accessible-name computation, so "this control has a name" passes on the
 * placeholder-only markup this change replaced -- it cannot tell before from
 * after. Association is asserted structurally instead.
 */

const LABELABLE = new Set(["input", "textarea", "select"]);

type Element = { tag: string; attrs: string };

const elements = (markup: string): Element[] =>
  Array.from(markup.matchAll(/<([a-z]+)\b([^>]*)>/g)).map((m) => ({
    tag: m[1] ?? "",
    attrs: m[2] ?? "",
  }));

const attr = (el: Element, name: string): string | null => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(el.attrs);
  return match?.[1] ?? null;
};

// Text of the first <label> carrying this `for`, with tags stripped.
const labelTextFor = (markup: string, id: string): string => {
  const pattern = new RegExp(
    `<label[^>]*\\sfor="${id}"[^>]*>(.*?)</label>`,
    "s",
  );
  return (pattern.exec(markup)?.[1] ?? "").replace(/<[^>]*>/g, "").trim();
};

const describeForm = (markup: string) => {
  const all = elements(markup);
  return {
    controls: all.filter((el) => LABELABLE.has(el.tag)),
    labelTargets: all
      .filter((el) => el.tag === "label")
      .map((el) => attr(el, "for"))
      .filter((v): v is string => v !== null),
    ids: all.map((el) => attr(el, "id")).filter((v): v is string => v !== null),
  };
};

const FORMS = {
  "contact form": {
    markup: () => renderToStaticMarkup(createElement(ContactForm)),
    // The properties `sendContactEmail` reads, and the labels a user should see.
    expected: { name: "Name", email: "Email", message: "Message" },
  },
  "blog authoring form": {
    markup: () => renderToStaticMarkup(createElement(CreateBlogPage)),
    // `private` is the rewind-ui Checkbox, which labels itself via its own
    // `label` prop. Included so this covers every control in the form.
    expected: {
      title: "Title",
      content: "Content",
      private: "Make this post private",
    },
  },
} as const;

for (const [formName, { markup, expected }] of Object.entries(FORMS)) {
  describe(formName, () => {
    it("labels every control it submits, via a resolvable id", () => {
      const rendered = markup();
      const { controls, ids } = describeForm(rendered);

      // Resolved through each control's own `id` attribute rather than a
      // hardcoded string, so renaming an id cannot leave this pointing at
      // nothing and still passing.
      const byName = Object.fromEntries(
        controls.map((el) => [attr(el, "name"), el]),
      );
      expect(Object.keys(byName).sort()).toEqual(Object.keys(expected).sort());

      for (const [name, labelText] of Object.entries(expected)) {
        const control = byName[name];
        const id = attr(control, "id");

        // An unlabelable target makes `for` inert, which is the failure mode if
        // rewind-ui ever puts the id on a wrapper instead of the control.
        expect(
          LABELABLE.has(control.tag),
          `[name=${name}] is a <${control.tag}>`,
        ).toBe(true);
        expect(
          id,
          `[name=${name}] has no id for a label to point at`,
        ).toBeTruthy();
        expect(
          ids.filter((candidate) => candidate === id),
          `id ${id} is not unique`,
        ).toHaveLength(1);

        // A `<label for>` that resolves but says nothing names nothing.
        expect(labelTextFor(rendered, id!), `label for [name=${name}]`).toBe(
          labelText,
        );
      }
    });

    it("points every label at a control that exists", () => {
      const rendered = markup();
      const { controls, labelTargets } = describeForm(rendered);
      const controlIds = new Set(controls.map((el) => attr(el, "id")));

      expect(labelTargets.length).toBe(Object.keys(expected).length);
      for (const target of labelTargets) {
        expect(controlIds.has(target), `no control has id ${target}`).toBe(
          true,
        );
      }
    });

    it("keeps no placeholder that merely restates its label", () => {
      const rendered = markup();
      const { controls } = describeForm(rendered);

      for (const control of controls) {
        const placeholder = attr(control, "placeholder");
        if (!placeholder) continue;
        // A placeholder echoing the label is not just noise: it masks a missing
        // label from any name-based audit.
        expect(
          placeholder.toLowerCase(),
          `[name=${attr(control, "name")}] placeholder restates its label`,
        ).not.toBe(labelTextFor(rendered, attr(control, "id")!).toLowerCase());
      }
    });
  });
}
