import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { signedInSession, sessionWithoutUser } from "@/test/auth-mock";
import BlogBodyAbbr, { attemptDelete } from "@/components/BlogBodyAbbr";
import { BLOG_DATE_TIME_FORMAT } from "@/lib/blogDate";
import type { Blog } from "@/lib/definitions";

const ID = "11111111-1111-4111-8111-111111111111";

function blog(overrides: Partial<Blog> = {}): Blog {
  return {
    id: ID,
    title: "A post",
    content: "body",
    date: new Date("2026-01-01"),
    private: false,
    ...overrides,
  };
}

function render(session: ReturnType<typeof signedInSession> | null, b: Blog) {
  return renderToStaticMarkup(
    createElement(BlogBodyAbbr, {
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

describe("BlogBodyAbbr delete control", () => {
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

describe("BlogBodyAbbr delete failure message", () => {
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

/**
 * The date, on the server pass only -- which turns out to be the half that
 * matters. `renderToStaticMarkup` runs no effects, so `now` is still null here,
 * exactly as it is in the real SSR pass and in the client's first render.
 *
 * That makes the load-bearing property directly observable: a post written
 * seconds ago must still render its ABSOLUTE date in server markup. Read the
 * clock during render instead and this markup says "5 seconds ago" -- which is
 * a React #418 hydration mismatch waiting for a post to sit near a bucket
 * edge, and there is no DOM in this suite to catch that any other way.
 */
describe("BlogBodyAbbr date", () => {
  const timeElement = (html: string): string | undefined =>
    /<time[^>]*>[\s\S]*?<\/time>/.exec(html)?.[0];

  const absolute = (d: Date) =>
    d.toLocaleDateString("en-US", BLOG_DATE_TIME_FORMAT);

  it("renders the date in a <time> carrying the exact instant", () => {
    // The machine-readable instant is what keeps an approximate visible string
    // honest, so the element and the attribute are the point, not decoration.
    const date = new Date("2026-01-01T05:30:00.000Z");
    const element = timeElement(render(null, blog({ date })));

    expect(element).toBeDefined();
    // Matched case-insensitively because React serialises this as `dateTime`,
    // with a capital T, in server markup. Not a defect and not ours to fix: HTML
    // attribute names are case-insensitive, so the parsed DOM still answers to
    // `getAttribute("datetime")` -- confirmed in a browser. A lowercase literal
    // here fails over correct output, which is how this was first written.
    expect(element).toMatch(
      new RegExp(`datetime="${date.toISOString()}"`, "i"),
    );
  });

  it("shows the absolute date on the server pass for an old post", () => {
    const date = new Date("2026-01-01T05:30:00.000Z");

    expect(timeElement(render(null, blog({ date })))).toContain(absolute(date));
  });

  // The regression guard. A seconds-old post is the input that tells a
  // render-time clock apart from an effect-supplied one: seed `now` from the
  // clock and this markup reads "5 seconds ago" instead of a date.
  //
  // Mutation-tested, and one result is worth writing down because it is not
  // obvious. This catches both mutations that change where `now` comes from --
  // collapsing to `useState(Date.now())`, and keeping the effect while seeding
  // state from the clock. It does NOT catch a render-time clock read passed
  // straight to the formatter, e.g. `formatBlogDateRelative(blog.date, new
  // Date().getTime())`, because that lives inside the `now === null` guard and
  // so never evaluates on a server pass. That one is caught only by the
  // denylist in ../lib/blogDateRelative.test.ts, which is why both tests exist
  // rather than this one superseding the structural one.
  it("shows the absolute date on the server pass even for a post seconds old", () => {
    const date = new Date(Date.now() - 5 * 1000);
    const element = timeElement(render(null, blog({ date })));

    expect(element).toContain(absolute(date));
    // Both spellings the sub-day buckets can produce, since "now" is what a
    // zero-second post renders and "seconds ago" is what any other does.
    expect(element).not.toContain("seconds ago");
    expect(element).not.toMatch(/>\s*now\s*</);
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
    const deleteBlogPost = vi.fn().mockResolvedValue(undefined);

    await attemptDelete(deleteBlogPost, ID, onFailure);

    // Both halves: "no failure reported" is also true of never trying, so the
    // attempt has to be pinned or this passes over a helper that does nothing.
    expect(deleteBlogPost).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  // The one that matters: `deleteBlogPost` ends in `redirect()`, which reports
  // success by rejecting. Treating every rejection as a failure would put the
  // failure message on screen after every delete that actually worked.
  it("reports nothing when the delete succeeds by redirecting", async () => {
    const onFailure = vi.fn();
    const deleteBlogPost = rejectingWith(redirectRejection());

    await attemptDelete(deleteBlogPost, ID, onFailure);

    expect(deleteBlogPost).toHaveBeenCalledTimes(1);
    expect(onFailure).not.toHaveBeenCalled();
  });

  // The digest grammar is `NEXT_REDIRECT;<type>;<url>;<status>;`, so a bare
  // prefix match on the code would also swallow this and lose a real failure.
  it("does not mistake a digest merely starting with the code for a redirect", async () => {
    const onFailure = vi.fn();

    await attemptDelete(
      rejectingWith(
        Object.assign(new Error("nope"), { digest: "NEXT_REDIRECTED" }),
      ),
      ID,
      onFailure,
    );

    expect(onFailure).toHaveBeenCalledTimes(1);
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
    // Equality, not `toContain`: a substring check passes over a message that
    // appends the thrown text to the fixed one.
    expect(onFailure.mock.calls[0]?.[0]).toBe(
      "Could not delete this post. Please try again.",
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
    // Being called is not enough: passing the redacted paragraph straight
    // through would satisfy a count-only assertion.
    expect(onFailure.mock.calls[0]?.[0]).toBe(
      "Could not delete this post. Please try again.",
    );
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

    // Called first, then checked: `calls[0]?.[0]` is `undefined` when the
    // callback never ran, and `undefined` does not contain "Unauthorized", so
    // the interesting assertion alone would pass on a helper that reports nothing.
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]?.[0]).not.toContain("Unauthorized");
  });

  it("passes the id it was given straight through", async () => {
    const deleteBlogPost = vi.fn().mockResolvedValue(undefined);

    await attemptDelete(deleteBlogPost, ID, vi.fn());

    expect(deleteBlogPost.mock.calls[0]).toEqual([ID]);
  });

  it("settles rather than rejecting, so no click leaves a loose rejection", async () => {
    const onFailure = vi.fn();

    await expect(
      attemptDelete(rejectingWith(new Error("Unauthorized")), ID, onFailure),
    ).resolves.toBeUndefined();
    // Otherwise a helper with an empty body also settles to `undefined`.
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it("tolerates a rejection that is not an Error at all", async () => {
    const onFailure = vi.fn();

    await attemptDelete(rejectingWith("NEXT_REDIRECT"), ID, onFailure);

    // A bare string carries no `digest`, so it is a failure, not a redirect.
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
