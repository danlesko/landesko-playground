import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { signedInSession, sessionWithoutUser } from "@/test/auth-mock";
import MyBlogBodyAbbr, { attemptDelete } from "@/components/MyBlogBodyAbbr";
import type { Blog } from "@/lib/definitions";

const ID = "11111111-1111-4111-8111-111111111111";

function blog(overrides: Partial<Blog> = {}): Blog {
  return {
    id: ID,
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

/** The delete button's inner HTML, so "the icon is inside *this* button" is
 * checkable rather than "an svg exists somewhere in the document". Matches on
 * the element, not on `aria-label`, so the icon assertions stay independent of
 * the name ones — otherwise a dropped label fails both and hides which broke. */
function deleteButtonInnerHtml(html: string): string | undefined {
  return /<button[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1];
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

  // Second, independent axis. The name above comes from `aria-label`, which
  // resolves whether or not the icon renders, so a name-only suite would stay
  // green over a named but invisible control. This fails if the icon vanishes.
  it("still renders the icon inside the delete button", () => {
    const inner = deleteButtonInnerHtml(render(signedInSession(), blog()));

    expect(inner).toMatch(/<svg/);
  });

  it("hides the icon from assistive tech so the button name stands alone", () => {
    const inner = deleteButtonInnerHtml(render(signedInSession(), blog()));

    expect(inner).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("omits the delete control entirely when nobody is signed in", () => {
    expect(render(null, blog())).not.toContain("<button");
    expect(render(sessionWithoutUser(), blog())).not.toContain("<button");
  });
});

/** The message element, so "empty" can be told apart from "absent" — the two
 * render the same under a `toContain` check on the text, and only one of them
 * announces when it later gains a message. */
function messageRegion(html: string): string | undefined {
  return /<p[^>]*aria-live="polite"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[0];
}

describe("MyBlogBodyAbbr delete failure message", () => {
  // A region created in the same mutation that gives it text is inconsistently
  // announced, so it has to be observed while still empty. That makes "mounted
  // and empty" the invariant worth pinning: rendering it only on failure would
  // look tidier and would announce less reliably.
  it("keeps the message region mounted for a viewer who can delete", () => {
    expect(messageRegion(render(signedInSession(), blog()))).toBeDefined();
  });

  it("leaves that region empty when there is nothing to report", () => {
    const region = messageRegion(render(signedInSession(), blog()));

    expect(region).toMatch(/<p[^>]*><\/p>$/);
  });

  it("announces politely rather than interrupting", () => {
    // The reader triggered this by confirming a delete, and the failed delete
    // has already stopped them, so `assertive` would preempt for no gain.
    const html = render(signedInSession(), blog());

    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('aria-live="assertive"');
  });
});

describe("attemptDelete", () => {
  const rejectingWith = (error: unknown) =>
    vi.fn<(id: string) => Promise<void>>().mockRejectedValue(error);

  // Shaped like what a real `redirect("/blog")` throws, measured out of a
  // production build: the message is the bare code and the destination and
  // status ride in `digest`.
  const redirectRejection = () =>
    Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/blog;307;",
    });

  it("reports nothing when the delete succeeds", async () => {
    const onFailure = vi.fn();

    await attemptDelete(vi.fn().mockResolvedValue(undefined), ID, onFailure);

    expect(onFailure).not.toHaveBeenCalled();
  });

  // The one that matters: `deleteBlogPost` ends in `redirect()`, which reports
  // success by rejecting. Treating every rejection as a failure would put the
  // failure message on screen after every delete that actually worked.
  it("reports nothing when the delete succeeds by redirecting", async () => {
    const onFailure = vi.fn();

    await attemptDelete(rejectingWith(redirectRejection()), ID, onFailure);

    expect(onFailure).not.toHaveBeenCalled();
  });

  it("reports a genuine failure exactly once, with a message", async () => {
    const onFailure = vi.fn();

    await attemptDelete(
      rejectingWith(new Error("Unauthorized")),
      ID,
      onFailure,
    );

    expect(onFailure.mock.calls).toHaveLength(1);
    // The argument list, not just the first argument: a second argument would
    // be a silent extra that a `toHaveBeenCalledWith` on one value still passes.
    expect(onFailure.mock.calls[0]).toHaveLength(1);
    expect(onFailure.mock.calls[0]?.[0]).toContain(
      "Could not delete this post",
    );
  });

  // A production build replaces the message of anything thrown in a server
  // action with a generic notice and attaches a numeric digest, so the failure
  // that has to be recognised in production looks like this, not "Unauthorized".
  it("reports a failure whose message production has redacted", async () => {
    const onFailure = vi.fn();
    const redacted = Object.assign(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
      ),
      { digest: "2508609312" },
    );

    await attemptDelete(rejectingWith(redacted), ID, onFailure);

    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  // The user-facing message must not be the thrown one: in production that is
  // the paragraph above, and in development it leaks "Unauthorized".
  it("never surfaces the thrown message to the reader", async () => {
    const onFailure = vi.fn();

    await attemptDelete(
      rejectingWith(new Error("Unauthorized")),
      ID,
      onFailure,
    );

    expect(onFailure.mock.calls[0]?.[0]).not.toContain("Unauthorized");
  });

  it("passes the id it was given straight through", async () => {
    const deleteBlogPost = vi.fn().mockResolvedValue(undefined);

    await attemptDelete(deleteBlogPost, ID, vi.fn());

    expect(deleteBlogPost.mock.calls[0]).toEqual([ID]);
  });

  it("settles rather than rejecting, so no click leaves a loose rejection", async () => {
    await expect(
      attemptDelete(rejectingWith(new Error("Unauthorized")), ID, vi.fn()),
    ).resolves.toBeUndefined();
  });

  it("tolerates a rejection that is not an Error at all", async () => {
    const onFailure = vi.fn();

    await attemptDelete(rejectingWith("NEXT_REDIRECT"), ID, onFailure);

    // A bare string carries no `digest`, so it is a failure, not a redirect.
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
