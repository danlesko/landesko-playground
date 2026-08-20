import { test, expect } from "@playwright/test";

/**
 * Browser-level smoke coverage for the routes that need no database.
 *
 * Every assertion here is written to fail if the markup it names disappears. A
 * status-code check would not: `/blog` currently answers 200 while rendering an
 * error, because the failure happens inside the component after the response has
 * begun. So each test names a specific element or a specific navigation result.
 */

// Routes that render *and hydrate* with no database, no session and no env
// config. Each entry names something only that page produces, so a test cannot
// pass against a blank shell. `/contact` is deliberately absent -- see below.
const PUBLIC_ROUTES = [
  { path: "/", heading: "Welcome to Landesko's Playground" },
  { path: "/animation", heading: "Animation" },
  { path: "/credits", heading: "Credits" },
] as const;

for (const { path, heading } of PUBLIC_ROUTES) {
  test(`${path} renders its own heading`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 2 }),
    ).toBeVisible();
  });
}

test("the home page LCP image loads eagerly at a declared size", async ({
  page,
}) => {
  await page.goto("/");
  const image = page.getByRole("img", { name: "Lan Playing Pool" });

  await expect(image).toBeVisible();

  // `priority` is the whole point of this image: it is the LCP element. Next 15
  // does *not* implement that as fetchpriority on the <img> -- it emits a
  // `<link rel="preload" as="image">` into <head> and leaves the tag with no
  // loading and no fetchpriority attribute at all. Asserting fetchpriority here
  // fails against a correctly configured image, so assert the preload instead,
  // and tie it to this image by comparing srcset rather than merely counting
  // that some preload exists.
  const srcSet = await image.getAttribute("srcset");
  expect(srcSet).toContain("/_next/image");
  await expect(
    page.locator('head link[rel="preload"][as="image"]'),
  ).toHaveAttribute("imagesrcset", srcSet!);

  // Dropping `priority` would add loading="lazy", which defers the LCP fetch
  // until layout -- the exact regression this guards.
  expect(await image.getAttribute("loading")).not.toBe("lazy");

  // Without `sizes` the browser assumes 100vw and picks a candidate far wider
  // than the half-width column this sits in. Both the tag and the preload hint
  // have to carry it, or the preload races the tag for a different candidate.
  await expect(image).toHaveAttribute("sizes", /min-width/);
  await expect(
    page.locator('head link[rel="preload"][as="image"]'),
  ).toHaveAttribute("imagesizes", /min-width/);

  // The rendered box must keep the file's 1286x1714 ratio, which is what stops
  // this image from contributing layout shift.
  //
  // Note what this does *not* catch: mutating height="1714" to height="900"
  // leaves the test green. Tailwind preflight sets `img { height: auto }`, so
  // with `w-full` the browser recomputes height from the decoded file and the
  // declared attributes stop mattering once the bytes land. What it does catch
  // is a class that pins the box -- swapping `h-auto` for `h-64` fails here.
  const box = await image.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(1286 / 1714, 2);
});

test("the p5 sketch mounts a canvas", async ({ page }) => {
  await page.goto("/animation");
  // p5 is loaded via `dynamic(..., { ssr: false })`, so the canvas only exists
  // once client JS has run. It has regressed before: a minified-identifier
  // collision left the whole chunk unparseable and the canvas never appeared
  // (#16), which no server-rendered assertion would have caught.
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
});

/**
 * `/contact` is covered with JavaScript disabled, on purpose.
 *
 * MyContactForm renders `react-google-recaptcha` with
 * `sitekey={process.env.NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA || ""}`. With
 * no key set, Google's api.js throws `Missing required parameters: sitekey`
 * during hydration and React unmounts the whole tree: the body collapses to
 * "Application error: a client-side exception has occurred" and the input count
 * goes from 3 to 0. Production sets the key, so this only bites environments
 * that do not -- but CI is one of those and must stay one, because no real key
 * belongs in this repo.
 *
 * The three rejected alternatives:
 *  - A fake key still reaches out to google.com, so the suite would depend on a
 *    third party being up. Worse, the throw only happens *because* api.js
 *    loaded: blocking google.com makes the page hydrate cleanly with all three
 *    inputs intact. An online runner and an offline runner would disagree.
 *  - Asserting with JS enabled and no key is a race, not a test. The heading is
 *    briefly present before the crash, which is why an earlier version of this
 *    file appeared to pass while navigating through a page that was dying.
 *  - Skipping `/contact` entirely loses the coverage the server response can
 *    genuinely provide.
 *
 * So: assert what the server sends, which is the contract #6 and #7 could
 * regress, and keep the hydration gap visible as the skip below.
 */
test.describe("/contact (server-rendered only)", () => {
  test.use({ javaScriptEnabled: false });

  test("renders its own heading", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { name: "Contact", level: 2 }),
    ).toBeVisible();
  });

  test("exposes the three form fields the server action reads", async ({
    page,
  }) => {
    await page.goto("/contact");
    // By `name`, the attribute `sendEmail` reads off FormData, rather than by
    // placeholder copy that an accessibility pass is free to rewrite.
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
  });
});

test("/blog/create redirects an anonymous visitor away", async ({ page }) => {
  // The one test that exercises src/middleware.ts. Its predicate reads
  // `req.auth?.user` rather than `req.auth`; a session object carrying no user
  // must still be treated as anonymous. Unit tests cover the predicate, but
  // nothing until now proved the redirect actually happens over HTTP.
  const response = await page.goto("/blog/create");

  await expect(page).toHaveURL("/");
  // Confirms we landed on the real home page rather than an empty redirect
  // target, and that the response chain ended in a success.
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Welcome to Landesko's Playground" }),
  ).toBeVisible();
});

test("the sidebar navigates between routes", async ({ page }) => {
  await page.goto("/");
  // Located by `href` and asserted by the resulting URL and the destination's
  // own heading. Link *text* is deliberately not the selector: #6 is extracting
  // shared primitives and #7 is an accessibility pass, so labels and wrappers
  // are expected to move. A test that fails on a label rename gets muted, and a
  // muted test protects nothing -- whereas "this href still reaches this page"
  // is the contract that must not break.
  const sidebar = page.getByRole("complementary");

  for (const { path, heading } of PUBLIC_ROUTES) {
    await sidebar.locator(`a[href="${path}"]`).click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 2 }),
    ).toBeVisible();
  }

  // Not clicked, for the reason given above the /contact block: the destination
  // tears itself down without a reCAPTCHA key, so asserting anything there
  // would be timing-dependent. The link still has to exist and still has to
  // point at the route, which is what #6 could break.
  await expect(sidebar.locator('a[href="/contact"]')).toBeVisible();
});

// `/blog` and `/blog/[id]` need a real `blogs` table. There is no schema in git
// -- the only DDL is a gitignored seed helper that declares no `private` column,
// so it demonstrably is not the live schema -- and CI has no database. `/blog`
// answers 200 today while rendering an error, so a naive check would look green.
// Blocked on #3; skipped loudly rather than omitted so the gap stays visible.
test.skip("/blog lists posts (needs a database -- see #3)", () => {});
test.skip("/blog/[id] renders a post (needs a database -- see #3)", () => {});

// Hydrated coverage of /contact needs NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA.
// Until the form degrades gracefully without one, the page cannot be driven in a
// real browser here at all -- not the widget, the entire route.
test.skip("/contact hydrates and submits (needs a reCAPTCHA site key)", () => {});
