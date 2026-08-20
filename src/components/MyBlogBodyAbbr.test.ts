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

  it("hides the icon from assistive tech so the button name stands alone", () => {
    const html = render(signedInSession(), blog());

    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("omits the delete control entirely when nobody is signed in", () => {
    expect(render(null, blog())).not.toContain("<button");
    expect(render(sessionWithoutUser(), blog())).not.toContain("<button");
  });
});
