import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CreateBlogState } from "@/lib/actions";

// Under SSR `useActionState` always yields the initial state, so the populated
// error states are unreachable by rendering alone. Overriding just that hook
// leaves the rest of React -- and therefore the real markup -- untouched.
// vi.hoisted, because the vi.mock factory is lifted above ordinary top-level
// declarations and cannot close over them.
const { useActionState } = vi.hoisted(() => ({ useActionState: vi.fn() }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, useActionState };
});

// The component only needs the action as an opaque reference; mocking it keeps
// "use server", the postgres driver and auth out of this file entirely.
vi.mock("@/lib/actions", () => ({ createBlog: vi.fn() }));

import CreateBlogForm from "@/app/blog/create/CreateBlogForm";

const render = (state: CreateBlogState): string => {
  useActionState.mockReturnValue([state, vi.fn(), false]);
  return renderToStaticMarkup(createElement(CreateBlogForm));
};

const escapeRe = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const attr = (attrs: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

/**
 * Controls are located by `name`, never by `id` or by the attribute under
 * test, so "the association is broken" stays distinguishable from "the element
 * is missing". `useId` also renders as «R0» here and _R_1_ in the browser, so a
 * `#`-selector would match nothing in one of the two and read as a pass.
 */
const control = (markup: string, name: string) => {
  const match = new RegExp(
    `<(input|textarea)\\b([^>]*\\sname="${escapeRe(name)}"[^>]*)>`,
  ).exec(markup);
  if (!match) throw new Error(`no control named ${name}`);
  return { tag: match[1] as string, attrs: match[2] as string };
};

/** The element a control's aria-describedby actually resolves to, if any. */
const describedBy = (markup: string, name: string) => {
  const id = attr(control(markup, name).attrs, "aria-describedby");
  if (id === null) throw new Error(`${name} has no aria-describedby`);
  const match = new RegExp(
    `<([a-z]+)([^>]*\\sid="${escapeRe(id)}"[^>]*)>([\\s\\S]*?)</\\1>`,
  ).exec(markup);
  return {
    id,
    found: match !== null,
    attrs: match?.[2] ?? "",
    text: match?.[3] ?? "",
  };
};

/**
 * Both fields are driven from one table and every per-field assertion is an
 * `it.each` case. The first version of this file only ever supplied a *title*
 * error, which meant deleting the content message and the content control's
 * `aria-invalid` outright left all 91 tests green. Asserting the two fields
 * symmetrically is what closes that, and doing it by iteration rather than by
 * copy-paste is what stops the asymmetry coming back.
 */
const FIELDS = ["title", "content"] as const;
type Field = (typeof FIELDS)[number];

const ERROR: Record<Field, string> = {
  title: "Title is required",
  content: "Content is required",
};

const OTHER: Record<Field, Field> = { title: "content", content: "title" };

const onlyInvalid = (field: Field): CreateBlogState => ({
  fieldErrors: { [field]: [ERROR[field]] },
});

describe("create-blog form error surface", () => {
  it.each(FIELDS)(
    "gives %s a describedby target that exists and is empty when valid",
    (field) => {
      const target = describedBy(render({}), field);

      expect(target.found, `${field} describedby ${target.id} resolves`).toBe(
        true,
      );
      expect(target.text, `${field} message is empty when valid`).toBe("");
    },
  );

  it.each(FIELDS)(
    "marks the %s message element as a live region up front, not on insertion",
    (field) => {
      expect(attr(describedBy(render({}), field).attrs, "aria-live")).toBe(
        "polite",
      );
    },
  );

  it.each(FIELDS)(
    "puts the %s message in the element that control points at",
    (field) => {
      const markup = render(onlyInvalid(field));

      // Not merely "the text is somewhere on the page": it has to be inside the
      // element this control names, or a screen reader never reaches it.
      expect(describedBy(markup, field).text).toBe(ERROR[field]);
      expect(describedBy(markup, OTHER[field]).text).toBe("");
    },
  );

  it.each(FIELDS)(
    "marks only %s invalid when only it has an error",
    (field) => {
      const markup = render(onlyInvalid(field));

      expect(attr(control(markup, field).attrs, "aria-invalid")).toBe("true");
      expect(
        attr(control(markup, OTHER[field]).attrs, "aria-invalid"),
      ).toBeNull();
    },
  );

  // The input and the textarea are asserted separately and each with a
  // non-empty value: folded into one `it` the first assertion fails alone and
  // the textarea half never runs, so a regression there would be invisible.
  it("repopulates the title input from the returned values", () => {
    const markup = render({
      fieldErrors: { content: [ERROR.content] },
      values: { title: "Title worth keeping", content: "", privateBlog: true },
    });

    // A text input carries its default in the value attribute.
    expect(attr(control(markup, "title").attrs, "value")).toBe(
      "Title worth keeping",
    );
  });

  it("repopulates the content textarea from the returned values", () => {
    const markup = render({
      fieldErrors: { title: [ERROR.title] },
      values: {
        title: "",
        content: "Content worth keeping",
        privateBlog: true,
      },
    });

    // A textarea carries its default as text content, not as an attribute.
    expect(attr(control(markup, "content").attrs, "value")).toBeNull();
    expect(markup).toContain(">Content worth keeping</textarea>");
  });

  it("keeps the private checkbox as the reader left it", () => {
    const withPrivateOff = render({
      fieldErrors: { title: [ERROR.title] },
      values: { title: "", content: "c", privateBlog: false },
    });

    expect(
      attr(control(withPrivateOff, "private").attrs, "checked"),
    ).toBeNull();
    expect(
      attr(control(render({}), "private").attrs, "checked"),
    ).not.toBeNull();
  });
});
