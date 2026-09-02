import { notFound } from "next/navigation";
import type { Session } from "next-auth";
import BlogBodyAbbr from "@/components/BlogBodyAbbr";
import { contentColumnClasses } from "@/components/ui/layout";

/**
 * A test fixture, and the only one in the repo. It renders a single blog card in the
 * signed-in state so the confirmation modal is reachable from a browser.
 *
 * WHY THIS EXISTS. `BlogBodyAbbr` is the only place the app renders a modal, and until now
 * nothing could render it: the delete trigger is behind `session?.user`, and the card itself
 * is rendered by `BlogList` from Postgres rows. So the modal had no unit coverage, no e2e
 * coverage, and axe never reached it. Two silent regressions shipped through that gap in one
 * evening -- a missing `justify-items-start` (#144) and a checkbox contrast defect (#145) --
 * each found only by hand-rendering the component on a throwaway route and measuring it.
 * This is that throwaway route, kept.
 *
 * It needs NO authentication, which is the part worth knowing before reaching for the
 * alternative. `BlogBodyAbbr` takes `session`, `blog` and `deleteBlogPost` as props, so a
 * fixture supplies all three directly. Minting a session cookie is possible -- there is no
 * database adapter, so Auth.js uses a JWT the tests could sign with the per-run secret the
 * Playwright config already generates -- but it would only be needed to exercise the real
 * `/blog` route, which additionally needs seeded data. That is a separate, larger piece of
 * work.
 *
 * WHAT IT DOES NOT DO, so nobody mistakes it for coverage of `/blog`: the props here are
 * static. It says nothing about pagination, about the query, about how a real row maps into
 * `Blog`, or about the private-post filter. It is a harness for one component's runtime
 * behaviour -- the modal's focus trap, its backdrop, Escape, reduced motion -- and that is
 * all it should ever grow to be.
 */

// The gate. Production never sets this, so the route 404s there; the Playwright config sets
// it for the test server. A `notFound()` rather than a build-time exclusion because the route
// has to exist in the same production build the e2e suite runs against -- that is the whole
// point of `webServer: pnpm start`, and a build that differs from the one under test would
// make the coverage worthless.
//
// `=== "1"` and not a truthiness check: an unset variable is `undefined`, but a *misspelled*
// one is a real risk in a CI config, and "any non-empty value" would let `E2E_FIXTURES=false`
// switch it on.
const FIXTURES_ENABLED = process.env.E2E_FIXTURES === "1";

// Fixed values, never `new Date()`. A card renders its date as a relative string, so a live
// clock would make the rendered text change between runs and any screenshot comparison
// useless. This instant is arbitrary and in the past.
const BLOG = {
  id: "fixture-1",
  title: "Fixture post",
  content:
    "A post that exists only so the delete confirmation can be opened in a browser.",
  date: new Date("2020-01-02T03:04:05.000Z"),
  private: false,
};

// Enough of a session for `session?.user` to be truthy, which is all the component reads.
// Typed as `Session` so a change to that shape fails the build here rather than silently
// rendering the signed-out branch and quietly removing the trigger this fixture exists for.
const SESSION: Session = {
  user: { name: "Fixture User", email: "fixture@example.invalid" },
  expires: "2999-01-01T00:00:00.000Z",
};

export default async function BlogCardFixture() {
  if (!FIXTURES_ENABLED) notFound();

  // A no-op stand-in for the real server action. It has to BE a server action: the card is a
  // client component, and a plain function cannot cross that boundary. Deliberately does
  // nothing -- the modal's confirm path is about the dialog, and a fixture that deleted
  // something would need something to delete.
  // Takes no parameter on purpose. The prop is typed `(id: string) => Promise<void>` and a
  // zero-arg function satisfies that, which avoids an unused binding -- lint runs at
  // `--max-warnings=0`, so an underscore-prefixed one is still a failure here.
  const deleteBlogPost = async () => {
    "use server";
  };

  return (
    <div className={contentColumnClasses}>
      <h1 className="text-4xl font-bold">Fixture: blog card</h1>
      <BlogBodyAbbr
        blog={BLOG}
        session={SESSION}
        deleteBlogPost={deleteBlogPost}
      />
    </div>
  );
}
