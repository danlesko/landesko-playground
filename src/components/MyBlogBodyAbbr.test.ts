import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { signedInSession, sessionWithoutUser } from "@/test/auth-mock";
import MyBlogBodyAbbr from "@/components/MyBlogBodyAbbr";
import type { Blog } from "@/lib/definitions";

function blog(overrides: Partial<Blog> = {}): Blog {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "A post",
    content: "body",
    date: "2026-01-01",
    ...overrides,
  };
}

function render(session: ReturnType<typeof signedInSession> | null, b: Blog) {
  return renderToStaticMarkup(
    createElement(MyBlogBodyAbbr, {
      session,
      blog: b,
      deleteBlogPost: vi.fn(),
    }),
  );
}

describe("MyBlogBodyAbbr delete control", () => {
  it("renders the delete control as a native button", () => {
    const html = render(signedInSession(), blog());

    // A native <button> is what makes the control tab-reachable and operable
    // with Enter/Space. Nothing here can see CSS or run a real keypress, so
    // this proves the element type, and the browser supplies the behaviour.
    expect(html).toMatch(/<button[^>]*type="button"/);
  });

  it("names the delete control after the post it deletes", () => {
    const html = render(signedInSession(), blog({ title: "Second post" }));

    expect(html).toContain('aria-label="Delete post: Second post"');
  });

  it("gives two posts distinct delete-control names", () => {
    const first = render(signedInSession(), blog({ title: "Alpha" }));
    const second = render(signedInSession(), blog({ title: "Beta" }));

    expect(first).toContain('aria-label="Delete post: Alpha"');
    expect(second).toContain('aria-label="Delete post: Beta"');
  });

  it("does not give the icon an accessible name of its own", () => {
    const html = render(signedInSession(), blog());

    // Phosphor only emits <title> when an `alt` prop is passed. Asserting the
    // absence keeps a future `alt` from double-announcing next to aria-label.
    expect(html).not.toContain("<title");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("omits the delete control entirely when nobody is signed in", () => {
    expect(render(null, blog())).not.toContain("<button");
    expect(render(sessionWithoutUser(), blog())).not.toContain("<button");
  });
});
