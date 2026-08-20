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

test("/credits attributes all four outbound resources", async ({ page }) => {
  await page.goto("/credits");

  // Scoped to <main> so the sidebar's links cannot pad the count. Nothing else
  // in the app renders an absolute href, so this is exactly the credits list.
  const outbound = page.getByRole("main").locator('a[href^="https://"]');

  // The count is load-bearing on its own: it fails if an entry is dropped, and
  // also if one is duplicated, neither of which a per-href check would catch.
  await expect(outbound).toHaveCount(4);

  // Compared as a sorted set rather than in order. The obligation is that all
  // four are credited, not that they appear in a fixed sequence -- #10 may well
  // reorder this list, and a test that fails on a reorder gets muted.
  const hrefs = await outbound.evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).sort(),
  );
  expect(hrefs).toEqual([
    "https://nextjs.org/",
    "https://rewind-ui.dev/",
    "https://tailwindcss.com/",
    "https://www.flaticon.com",
  ]);

  // A credit with no text credits nobody. Asserted as non-empty rather than by
  // wording, which #7 is expected to revise.
  //
  // Visible text, deliberately, not the accessible name. These anchors carry
  // `title={credit.title}`, and `title` is a fallback in the accessible-name
  // computation -- so blanking the label leaves every link still *named* while
  // rendering four empty bullets. Verified: an accessible-name check passes
  // against that mutation and this one fails. Worth knowing for #7, where the
  // same masking would make an audit look clean.
  for (const link of await outbound.all()) {
    await expect(link).toHaveText(/\S/);
  }
});

test("the home page LCP image loads eagerly at a declared size", async ({
  page,
}) => {
  await page.goto("/");
  const image = page.getByRole("img", { name: "Lan Playing Pool" });

  await expect(image).toBeVisible();

  // Every other assertion in this test passes against a `src` that 404s: the
  // element stays visible, Next still generates srcset/preload/sizes from the
  // declared dimensions, and the width/height attributes keep the box ratio.
  // Observed by pointing src at a nonexistent file -- the server logged
  // "The requested resource isn't a valid image ... received null" and the test
  // went green. `complete` alone is not enough either; it is true for a failed
  // load, which is why naturalWidth is the actual check.
  await expect(image).toHaveJSProperty("complete", true);
  expect(
    await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);

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

  // The declared intrinsic size, which is what reserves the box before the
  // bytes arrive. This is a separate guarantee from the rendered ratio below:
  // mutating height="1714" to height="900" leaves every other assertion in this
  // test green, because Tailwind preflight sets `img { height: auto }` and with
  // `w-full` the browser recomputes height from the decoded file once it lands.
  // Wrong declared numbers therefore only hurt during the pre-load window --
  // exactly the window that produces layout shift.
  await expect(image).toHaveAttribute("width", "1286");
  await expect(image).toHaveAttribute("height", "1714");

  // And the rendered box, which catches the other half: a class that pins the
  // height, such as swapping `h-auto` for `h-64`, squashes the image without
  // touching a single attribute above.
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
 * `/contact` needs special handling, and the reason is worth writing down.
 *
 * MyContactForm renders `react-google-recaptcha` with
 * `sitekey={process.env.NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA || ""}`. With
 * no key set, Google's api.js throws `Missing required parameters: sitekey`
 * during hydration and React unmounts the whole route: the body collapses to
 * "Application error: a client-side exception has occurred" and the input count
 * drops from 3 to 0. Production sets the key, so only environments without one
 * are affected -- but CI is such an environment and has to stay one, because no
 * real key belongs in this repo.
 *
 * Rejected: passing a fake key. The throw happens *because* api.js loaded, so a
 * fake key makes the suite depend on google.com being reachable, and an online
 * runner and an offline runner would then disagree about whether this page
 * works. Also rejected: asserting with JS enabled and no interception, which is
 * a race rather than a test -- the heading is briefly present before the crash,
 * which is why an earlier draft of this file appeared to pass while clicking
 * through a page that was in the middle of dying.
 *
 * Taken instead: block the third party explicitly, which is deterministic in
 * both directions, and cover the route twice -- once for what the server sends
 * and once for whether it actually comes alive in the browser.
 */
test.describe("/contact", () => {
  // `javaScriptEnabled` is a browser-context option, so it needs its own block
  // rather than a line inside the test.
  test.describe("server-rendered, JavaScript disabled", () => {
    test.use({ javaScriptEnabled: false });

    test("sends the heading and the three fields the server action reads", async ({
      page,
    }) => {
      // Purely about the server's output, so it stays meaningful even when the
      // client bundle is broken -- which, without a site key, it is.
      await page.goto("/contact");

      await expect(
        page.getByRole("heading", { name: "Contact", level: 2 }),
      ).toBeVisible();
      // By `name`, the property `sendContactEmail` reads off the submitted
      // object, rather than by placeholder copy an a11y pass may rewrite.
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('textarea[name="message"]')).toBeVisible();
    });
  });

  test("hydrates: the form's own reCAPTCHA guard runs on submit", async ({
    page,
  }) => {
    // Blocking Google is what makes this deterministic. api.js never loads, so
    // it never throws on the empty sitekey, the route hydrates intact, and
    // `recaptcha.current?.getValue()` returns undefined -- which is the branch
    // MyContactForm handles with an alert.
    await page.route("**://*.google.com/**", (route) => route.abort());
    await page.route("**://*.gstatic.com/**", (route) => route.abort());

    await page.goto("/contact");

    // Filling these proves the controlled inputs are wired: `value` is bound to
    // React state, so without a working `onChange` the fields stay empty and
    // the browser's own `required` validation blocks submit before the handler
    // is ever reached.
    await page.locator('input[name="name"]').fill("Smoke Test");
    await page.locator('input[name="email"]').fill("smoke@example.com");
    await page
      .locator('textarea[name="message"]')
      .fill("Hello from Playwright");
    await expect(page.locator('input[name="name"]')).toHaveValue("Smoke Test");

    // Dismissed from inside the listener rather than after an awaited click.
    // Registering any dialog listener disables Playwright's auto-dismiss, and a
    // native alert blocks the page, so `await click()` would never resolve and
    // the test would fail on a 30s timeout instead of on its assertion.
    let alerted = "";
    page.once("dialog", async (dialog) => {
      alerted = dialog.message();
      await dialog.dismiss();
    });

    await page.getByRole("button", { name: "Send Message" }).click();

    // Reaching this alert is the assertion. It can only fire from inside
    // `handleSubmit`, so it proves the route hydrated, React bound onSubmit, and
    // the client-side captcha guard still refuses to submit unverified -- none
    // of which the server-rendered HTML above can tell us.
    await expect.poll(() => alerted).toBe("Please verify the reCAPTCHA!");
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

test("the sidebar client-side navigates between routes", async ({ page }) => {
  // Starts on /credits, not /. PUBLIC_ROUTES begins with "/", so starting there
  // made the first iteration assert that clicking Home while already on Home
  // leaves us on Home -- true no matter what that link does, even if its click
  // were swallowed entirely. Beginning elsewhere makes every iteration a real
  // transition.
  await page.goto("/credits");

  // Destinations are pinned by `href`, not by visible link text. #6 is
  // extracting shared primitives and #7 is an accessibility pass, so labels and
  // wrappers are expected to move; a test that fails on a rename gets muted,
  // and a muted test protects nothing. But dropping text entirely would let an
  // unlabelled or icon-only link pass, so the accessible name is asserted to be
  // non-empty without pinning its wording -- the part #7 should strengthen
  // rather than the part it will churn.
  const sidebar = page.getByRole("complementary");

  // A full page load would reset this, so its survival is what distinguishes
  // client-side routing from the browser simply following an anchor. The
  // sidebar is a client component whose entire purpose is soft navigation.
  await page.evaluate(() => {
    Object.assign(window, { __sameDocument: true });
  });

  for (const { path, heading } of PUBLIC_ROUTES) {
    const link = sidebar
      .getByRole("link")
      .and(page.locator(`a[href="${path}"]`));
    await expect(link).toHaveAccessibleName(/\S/);

    await link.click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 2 }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => "__sameDocument" in window),
      `navigating to ${path} reloaded the document instead of routing client-side`,
    ).toBe(true);
  }

  // Present and correctly pointed, but not clicked: the destination tears itself
  // down without a reCAPTCHA key (see the /contact block above), so asserting on
  // the page it lands on would be timing-dependent.
  await expect(
    sidebar.getByRole("link").and(page.locator('a[href="/contact"]')),
  ).toHaveAccessibleName(/\S/);
});

/**
 * Known gaps, declared as skips so they appear in the run output instead of
 * being invisibly absent.
 *
 * Each body throws rather than being empty. An empty body would pass the moment
 * someone deleted the `.skip`, turning a gap into fake coverage -- the exact
 * failure mode this file exists to avoid.
 */
const unimplemented = (reason: string) => () => {
  throw new Error(`Not implemented: ${reason}`);
};

// `/blog` and `/blog/[id]` need a real `blogs` table. There is no schema in git
// -- the only DDL is a gitignored seed helper that declares no `private` column,
// so it demonstrably is not the live schema -- and CI has no database. `/blog`
// answers 200 today while rendering an error, so a naive check would look green.
test.skip(
  "/blog lists posts (needs a database -- see #3)",
  unimplemented("no blogs table in CI"),
);
test.skip(
  "/blog/[id] renders a post (needs a database -- see #3)",
  unimplemented("no blogs table in CI"),
);

// The happy path stops at the captcha guard above. Getting past it needs a real
// NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA plus a live token, and the send
// beyond it needs mail credentials, none of which belong in CI.
test.skip(
  "/contact delivers a message end to end (needs a reCAPTCHA key and mail credentials)",
  unimplemented("cannot obtain a captcha token without a site key"),
);
