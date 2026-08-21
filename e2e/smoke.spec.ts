import { test, expect } from "@playwright/test";

/**
 * Browser-level smoke coverage for the routes that need no database.
 *
 * Every assertion here is written to fail if the markup it names disappears. A
 * status-code check would not: `/blog` currently answers 200 while rendering an
 * error, because the failure happens inside the component after the response has
 * begun. So each test names a specific element or a specific navigation result.
 */

// The sidebar, named rather than located by tag, so the assertions below survive
// the wrapper moving. Defined once so a rename has one place to change -- the
// tests that call it would all still fail, but only this line needs editing.
//
// `exact` because Playwright's name matching is substring and case-insensitive
// by default, which would let a landmark named "Main menu" satisfy every
// assertion that claims to pin the name to "Main".
const mainNav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main", exact: true });

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
      page.getByRole("heading", { name: heading, level: 1 }),
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
        page.getByRole("heading", { name: "Contact", level: 1 }),
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
  // Was `complementary`: the sidebar is a named `navigation` landmark now, which
  // is the "wrappers are expected to move" case above actually happening. The
  // name is pinned rather than located by tag, so this keeps working if the
  // wrapper moves again and fails if the landmark stops being navigation.
  const sidebar = mainNav(page);

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
      page.getByRole("heading", { name: heading, level: 1 }),
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

test("the page exposes one banner and exactly one navigation landmark", async ({
  page,
}) => {
  await page.goto("/credits");

  // `header` maps to `banner` only outside article/aside/main/nav/section. It
  // sits in a plain wrapper so it qualifies, but that is asserted rather than
  // reasoned about: the nesting rule fails silently, leaving a generic element
  // no one can jump to and no error anywhere.
  await expect(page.getByRole("banner")).toHaveCount(1);

  // Exactly one, not two. The top bar used to be a `nav` holding no links at
  // all, so a screen-reader user could jump to a navigation landmark with
  // nothing navigable in it. This count fails in both directions that matter:
  // if the sidebar reverts to a non-navigation wrapper, and if a spurious nav
  // landmark is reintroduced.
  await expect(page.getByRole("navigation")).toHaveCount(1);
  await expect(mainNav(page)).toHaveCount(1);
});

test("the sidebar toggle reports a truthful expanded state below `lg`", async ({
  page,
}) => {
  // 1023px is one pixel below Tailwind's `lg`, so the disclosure is live here.
  await page.setViewportSize({ width: 1023, height: 800 });
  await page.goto("/credits");

  const sidebar = mainNav(page);
  const toggle = sidebar.getByRole("button", { name: "Menu" });
  await expect(toggle).toBeVisible();

  // Two claims, pinned separately: the computed name is exactly "Menu", and it
  // comes from `aria-label`. Neither implies the other -- an `aria-labelledby`
  // would outrank the label and change the name, while `alt` is a name fallback,
  // so the name alone was already "Menu" before `aria-label` existed.
  await expect(toggle).toHaveAccessibleName("Menu");
  await expect(toggle).toHaveAttribute("aria-label", "Menu");

  // Neither line above can carry the decorative-icon claim:
  // `aria-label` outranks descendant content, so reinstating the icon's alt text
  // would leave the computed name "Menu" and that assertion green while the
  // image went back to being a node of its own inside the button. Mutation-
  // tested: restoring `alt="Menu"` fails this line and only this line. The claim
  // is one fewer node, not a duplicated announcement -- the name is unchanged.
  await expect(toggle.getByRole("img")).toHaveCount(0);

  // Resolved through the attribute rather than by hardcoding the id, so this
  // proves the pair is actually wired: `aria-controls` naming an id that no
  // element has is the standard way this markup rots, and a literal selector
  // here would keep passing while pointing at nothing. The count also pins
  // uniqueness -- a duplicated id would make the reference ambiguous.
  const controls = await toggle.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  const menu = page.locator(`#${controls}`);
  await expect(menu).toHaveCount(1);
  // Located by href rather than by role: the menu is collapsed at this point, so
  // its links are outside the accessibility tree and a role query legitimately
  // finds nothing. The claim being made here is structural -- `aria-controls`
  // points at the element that holds the navigation -- not about visibility.
  await expect(menu.locator('a[href="/"]')).toHaveCount(1);

  // The state and the thing it describes are asserted together at every step;
  // checking `aria-expanded` alone would pass for a toggle that reports state
  // while controlling nothing.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
});

test("the sidebar never announces a collapsed state at `lg` and above", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/credits");

  const sidebar = mainNav(page);

  // The menu is on screen here whatever `isOpen` says, and the toggle still
  // carries `aria-expanded="false"` in the DOM. That pairing is only honest
  // because the toggle is absent from the accessibility tree, which is what
  // these counts establish between them: excluded from the tree, but still
  // present in the DOM. Asserting only the first would also pass if the toggle
  // were deleted outright, and asserting neither would leave the central claim
  // of this change resting on an inference about how `display: none` behaves.
  await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Menu", includeHidden: true }),
  ).toHaveCount(1);

  // Not redundant with the role counts above: those two would equally describe a
  // visible button hidden from the tree with `aria-hidden`, which would put a
  // stale expanded state on screen while still satisfying them. This is the one
  // that pins it to actually not being rendered.
  await expect(sidebar.locator("button")).toBeHidden();
});

test("the sidebar marks exactly the current page, and follows the route", async ({
  page,
}) => {
  await page.goto("/credits");
  const sidebar = mainNav(page);

  // `aria-current` is queried across the whole landmark rather than on the link
  // expected to carry it, because the defect worth catching is more than one
  // link claiming to be current -- which a check on a single link cannot see.
  const current = sidebar.locator("[aria-current]");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toHaveAttribute("href", "/credits");

  // Soft navigation, so the mark has to move. A server-rendered-only attribute
  // would satisfy the assertions above and then go stale on the first click.
  await sidebar.getByRole("link", { name: "Animation" }).click();
  await expect(page).toHaveURL("/animation");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("href", "/animation");
  // Re-asserted after the move, not just before it: the locator matches any
  // `aria-current`, so a route-dependent bug emitting `true` would keep the count
  // at one and satisfy the href. That still announces a current item, just not
  // which kind, so only pinning the exact token holds the page-level meaning.
  await expect(current).toHaveAttribute("aria-current", "page");
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

/**
 * The viewport here is load-bearing, and not in a way anyone would guess.
 *
 * `updateCanvasDimensions` picks a width-led or a height-led branch by comparing
 * the viewport's aspect ratio against the sketch's. Playwright's default
 * 1280x720 is 1.778, which lands in the *height*-led branch -- the branch that
 * never overflowed. So this guard passes at the default size whether or not the
 * bug is present, and asserting at the default would be no guard at all.
 *
 * 1280x1024 is 1.25, which takes the width-led branch. That branch sized the
 * canvas from `p5.windowWidth`, ignoring the 250px sidebar and <main>'s 32px of
 * padding, and `<main>` is a flex item whose `min-width` defaults to `auto`, so
 * it widened to fit the oversized canvas instead of clipping it. The page ended
 * up 232px wider than the window at this size, and at 1024x768, 1024x900 and
 * 1440x900 too.
 */
test("the p5 canvas does not push the page wider than the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1024 });
  await page.goto("/animation");
  // Same reason as the mount test above: the canvas is client-only, so there is
  // nothing to measure until p5 has run `setup`.
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

/**
 * The height-led branch subtracts a flat 300 from both dimensions, so a short
 * window drives them to zero and then past it: at a 186px window height the
 * width is -1.4. p5 hands that straight to <canvas> and the renderer crashes the
 * tab outright — reproduced at 186, 185 and 183, while 187 still rendered.
 * `scaleFactor` divides by the same value, so zero is no safer than negative.
 *
 * 800x186 is the boundary case rather than an arbitrary tiny window:
 * 300 / (1180 / 735) = 186.86 is where the width crosses zero. A crashed tab
 * makes `evaluate` throw, so a regression fails loudly here rather than subtly.
 *
 * The size assertions are deliberately magnitudes, not `> 0`, and they catch a
 * second regression the crash cannot. Floors of `0` do not render here — they
 * crash too, because `scaleFactor` divides by the width and hands `Infinity` to
 * the draw calls — and at the heights where a zero dimension does survive
 * (800x250, 800x300) the canvas has an empty bounding box, so it is not visible
 * either. A floor of `1`, though, renders a visible 1x1 canvas that no crash and
 * no visibility check can see. So `> 0` was unfalsifiable and a magnitude is not:
 * it asserts the floors are still a usable minimum, not merely a positive one.
 *
 * The margins are exactly zero, which is the point rather than an oversight: at
 * this viewport the branch computes -1.39 and -114, so both floors apply and the
 * received values are precisely 120 and 75. Lowering either floor by one pixel
 * fails here. The numbers are derived, not fitted after the fact.
 */
test("the p5 canvas survives a window shorter than the reserved height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 186 });
  await page.goto("/animation");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const size = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    return { width: canvas?.width ?? 0, height: canvas?.height ?? 0 };
  });

  expect(size.width).toBeGreaterThanOrEqual(120);
  expect(size.height).toBeGreaterThanOrEqual(75);
});

/**
 * The guard above is directional: it catches a width floor that is too low, and
 * cannot catch one that is too high. Too high is the more plausible edit — the
 * floor looks like a "smallest usable tank" knob, so raising it to something
 * comfortable reads as an improvement — and it reintroduces #57, because the
 * floor bypasses the `Math.min` that used to make "never wider than the
 * container" true by construction.
 *
 * 320px wide is what makes this checkable, and the existing overflow guard
 * cannot substitute for it. Measured against a build with the width floor raised
 * to 320: here the page overflows by 16px (canvas 320 in a 288px container),
 * while at that guard's 1280x1024 the canvas is 998 in a 998px container and
 * nothing overflows at all. An assertion that the canvas fits its container
 * would pass there too, so the *viewport* is the load-bearing part, not the
 * assertion. Same blind spot as 1280x720 in the guard above -- and 320px is a
 * real phone width rather than a contrived one.
 */
test("the p5 canvas fits its container at the narrowest supported width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/animation");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const measurements = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const root = document.documentElement;
    return {
      overflow: root.scrollWidth - root.clientWidth,
      canvasWidth: canvas?.width ?? 0,
      containerWidth: canvas?.parentElement?.clientWidth ?? 0,
    };
  });

  expect(measurements.overflow).toBe(0);
  expect(measurements.canvasWidth).toBeLessThanOrEqual(
    measurements.containerWidth,
  );
});

/**
 * The global CSS rule that neutralises animation and transition durations cannot
 * reach a <canvas>: the fish move because a JS draw loop mutates coordinates, not
 * because a keyframe animation is running. So the only way to know the canvas
 * honours the preference is to emulate it and watch the pixels.
 *
 * Two shots of the same page rather than a golden image: the seaweed is
 * randomised per load, so no stored screenshot could ever match, and "did this
 * change" is the property under test anyway. It also covers the seam the unit
 * tests cannot reach - the component reading `matchMedia` and handing the answer
 * to the sketch.
 *
 * Crucially the running case has to be polled, not sampled once after a fixed
 * delay. Every fish starts hundreds of pixels outside the canvas and the water,
 * seaweed and sand are static, so the first ~40 frames of the animation are
 * pixel-identical to each other. A 400ms sample of a perfectly healthy canvas
 * reports "still" about half the time.
 */
const canvasOf = async (page: import("@playwright/test").Page) => {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  return canvas;
};

async function expectCanvasToAnimate(page: import("@playwright/test").Page) {
  const canvas = await canvasOf(page);
  const first = await canvas.screenshot();

  // The first fish needs roughly 50 real draw frames to reach the canvas, so the
  // budget has to cover a CI runner rendering at a few frames per second. Polling
  // returns the moment the pixels differ, so a generous ceiling costs nothing.
  await expect
    .poll(async () => (await canvas.screenshot()).equals(first), {
      timeout: 20_000,
      intervals: [250],
    })
    .toBe(false);
}

async function expectCanvasToHold(page: import("@playwright/test").Page) {
  const canvas = await canvasOf(page);
  const first = await canvas.screenshot();

  // Two seconds is ~120 frames. With the loop running the fish cover 3px or more
  // per frame, so the very first sample would already differ.
  for (let sample = 0; sample < 8; sample++) {
    await page.waitForTimeout(250);
    expect((await canvas.screenshot()).equals(first)).toBe(true);
  }
}

test.describe("the p5 canvas and prefers-reduced-motion", () => {
  test("keeps swimming when no preference is set", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/animation");

    await expectCanvasToAnimate(page);
  });

  test("settles into a still frame when reduce is preferred", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/animation");

    await expectCanvasToHold(page);
  });

  // A still frame is only an acceptable substitute for the animation if it still
  // shows the aquarium the page is about. Stopping the loop without placing the
  // fish first leaves water, seaweed and sand but no fish at all.
  //
  // Each fish is counted separately, not just one: eight of the nine are placed
  // by the resting layout and the ninth is anchored separately, so a check that
  // found any single fish could pass over seven missing ones - the first version
  // of this test looked only for the anchored goldfish and passed against main.
  // Each body colour is an exact fill that nothing else in the tank uses, except
  // the green fish, which shares rgb(34, 139, 34) with one of the four seaweed
  // colours; its count would prove nothing, so it is the one left uncounted.
  test("shows eight of the nine fish in that still frame", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/animation");
    await canvasOf(page);

    const FISH_BODY_COLOURS = {
      purpleSmall: [128, 0, 128],
      cyanSmall: [0, 255, 255],
      redMedium: [255, 0, 0],
      tealLarge: [0, 128, 128],
      lightRedSmall: [255, 102, 102],
      paleRedLarge: [255, 128, 128],
      darkCyanMedium: [0, 153, 153],
      cursorGoldfish: [255, 153, 51],
    } as const;

    const counts = await page.evaluate((colours) => {
      const canvas = document.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return null;
      }

      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const found: Record<string, number> = {};

      for (const [name, [r, g, b]] of Object.entries(colours)) {
        let matches = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === r && data[i + 1] === g && data[i + 2] === b) {
            matches++;
          }
        }
        found[name] = matches;
      }

      return found;
    }, FISH_BODY_COLOURS);

    // The smallest fish is around 130 pixels of body at this viewport, so 50 is
    // clear of both antialiasing and any renderer difference in CI.
    for (const name of Object.keys(FISH_BODY_COLOURS)) {
      expect(
        counts?.[name],
        `${name} is missing from the still frame`,
      ).toBeGreaterThan(50);
    }
  });

  test("stops when the preference is turned on without a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/animation");
    await expectCanvasToAnimate(page);

    await page.emulateMedia({ reducedMotion: "reduce" });
    // The change event rebuilds the sketch from scratch, so let the replacement
    // instance settle before sampling it.
    await page.waitForTimeout(1000);

    await expectCanvasToHold(page);
    // The old p5 instance has to go with it, or a second sketch keeps drawing.
    await expect(page.locator("canvas")).toHaveCount(1);
  });

  // The other direction is a separate failure mode, not a mirror image: a
  // listener that only reacts when the query starts matching passes every other
  // test here and leaves the canvas frozen for a reader who turns the preference
  // back off.
  test("resumes when the preference is turned off without a reload", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/animation");
    await expectCanvasToHold(page);

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForTimeout(1000);

    await expectCanvasToAnimate(page);
    await expect(page.locator("canvas")).toHaveCount(1);
  });
});
