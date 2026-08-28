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

test("the home hero links to every destination it promises", async ({
  page,
}) => {
  await page.goto("/");

  // Scoped to <main>, which on this page contains the hero and nothing else --
  // so "inside main" and "inside the hero" coincide here, and the sidebar's own
  // copies of /blog, /animation and /contact cannot supply the answer. The
  // sidebar <nav> is a sibling of <main> in layout.tsx, which is what makes the
  // scoping work at all.
  const links = page.getByRole("main").locator("a[href]");

  const hrefs = await links.evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")).sort(),
  );
  // An exact set rather than a subset: it fails on a dropped destination and on
  // a duplicate, and it fails loudly if a link is added without a decision.
  expect(hrefs).toEqual([
    "/animation",
    "/blog",
    "/contact",
    "https://github.com/danlesko",
    "https://www.linkedin.com/in/danlesko/",
  ]);

  // Deliberately not the accessible name: in the name computation `aria-label`
  // replaces what an element's own text would contribute, and `title` stands in
  // when nothing else does -- so a name-based check can be satisfied by an anchor
  // that renders nothing. These two catch an anchor whose `innerText` is empty
  // and an anchor with no box.
  //
  // Neither alone would do, and `innerText` is the weaker of the two for a reason
  // worth writing down: on an element that is not being rendered it returns
  // `textContent` rather than the empty string, so it stays populated under
  // `display:none`. `toBeVisible` is what actually covers that, along with
  // `visibility:hidden` and a zero-area box.
  //
  // What the pair does NOT establish is that a sighted reader can see the text:
  // `opacity:0`, clipping, occlusion, off-screen placement and text painted in
  // the background colour all survive both. Nothing here claims otherwise.
  const count = await links.count();
  expect(count).toBe(hrefs.length);
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    await expect(link).toBeVisible();
    expect((await link.innerText()).trim()).not.toBe("");
  }
});

/**
 * The `sizes` contract that #10 warned about in as many words: the sidebar is a
 * fixed 250px from `lg` up and `<main>` adds 32px of padding, so the hero's image
 * column is `calc((100vw - 282px) / 2)` -- and if the page structure or the sidebar
 * width changes without that attribute being updated, the browser is left choosing
 * a candidate against a width the image no longer has -- and nothing about the
 * layout changes to announce it. Declare too large and the cost is bytes nobody
 * notices; too small and the photo goes soft, which is the kind of thing that gets
 * lived with rather than filed. That quiet is why this is a test and not a comment.
 *
 * What it pins is that mismatch, and only that. Whether any particular mismatch is
 * big enough to change which file the browser actually downloads depends on the
 * gaps between the candidate widths, so the mismatch is the thing worth failing on
 * rather than a claim about the chosen resource.
 *
 * It works by evaluating the declared expression itself rather than restating the
 * arithmetic: the attribute's own `calc()` is applied to a probe element and the
 * result compared to the image's real width. To be exact about what that buys,
 * because the first version of this comment overstated it -- a test that hardcoded
 * `(100vw - 282px) / 2` as the expected value would *also* fail when the sidebar
 * changed, since the rendered width moves and the constant does not. What it would
 * additionally do is fail when someone changes the sidebar and updates `sizes`
 * correctly, i.e. exactly when the code is right. Reading the attribute tests the
 * relationship rather than a frozen constant, which is the difference between a
 * test that survives a legitimate change and one that gets muted for crying wolf.
 *
 * Sensitivity is worth stating, since it is not 1:1. The 282px is split between
 * two columns, so a sidebar change of N pixels moves this image by only N/2 --
 * which is why the tolerance below is a fraction of a pixel and not the pixel of
 * slack it started as, which passed a 250px -> 252px sidebar.
 *
 * And the limit, since sampling is not proof: this checks the widths listed below.
 * A sidebar width introduced at a breakpoint above the largest of them, or active
 * only between two of them, still passes. Widening that is a matter of adding
 * widths, not of the test being wrong.
 */
test("the home hero image declares the width it actually renders", async ({
  page,
}) => {
  await page.goto("/");

  // Both branches of the attribute, three widths inside the `min-width: 1024px`
  // one. The extra desktop widths are not redundant: a sidebar width introduced at
  // a breakpoint above the only viewport tested would leave this green, so one
  // sample per branch is not enough to claim the branch holds. 1281 is deliberately
  // odd -- the column is half of `100vw - 282px`, so it lands on a half pixel and
  // covers the fractional-track case that even widths never reach.
  for (const width of [1280, 1281, 1600, 390]) {
    await page.setViewportSize({ width, height: 900 });

    const measured = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(
        'img[alt="Lan Playing Pool"]',
      );
      if (!img) throw new Error("hero image not found");
      const sizes = img.getAttribute("sizes");
      if (!sizes) throw new Error("hero image has no sizes attribute");

      // Pick the branch that applies right now. Entries are `<media condition>
      // <size>` with a bare `<size>` last; no comma appears inside either half
      // of this attribute, so splitting on commas is sufficient here.
      let declared: string | null = null;
      for (const entry of sizes.split(",").map((s) => s.trim())) {
        if (!entry.startsWith("(")) {
          declared = entry;
          break;
        }
        const close = entry.indexOf(")");
        if (window.matchMedia(entry.slice(0, close + 1)).matches) {
          declared = entry.slice(close + 1).trim();
          break;
        }
      }
      if (!declared) throw new Error(`no sizes branch matched: ${sizes}`);

      // Let the browser resolve the declared expression instead of recomputing
      // it. `vw` units ignore the ancestor box, so an absolutely-positioned
      // probe measures the same length the image selection used.
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;top:0;left:0;height:1px;visibility:hidden;width:${declared}`;
      document.body.append(probe);
      const declaredPx = probe.getBoundingClientRect().width;
      probe.remove();

      return {
        declared,
        declaredPx,
        actualPx: img.getBoundingClientRect().width,
      };
    });

    // Effectively exact. 0.02 is a hair above Chromium's 1/64px layout unit, and
    // that is all it is -- not a proof that two independently computed geometries
    // can only ever disagree by one unit. It is small enough to be worth having
    // and it holds at every width sampled here, measured, locally and in CI.
    //
    // The 1px bound this replaces was not worth much: the sidebar's 282px is
    // halved across two columns, so a 250px -> 252px sidebar and a stray
    // `lg:gap-0.5` each move the image by exactly 1px and both slipped through.
    // Both now fail. A `lg:gap-8` costs 16px per column and was caught either way.
    //
    // A classic scrollbar would break this, since `100vw` counts the gutter while
    // the content box does not -- by half the gutter on the two-column branch and
    // by all of it on the mobile one. It needs no separate assertion: it shows up
    // here as a plain mismatch, with the message below naming both numbers.
    expect(
      Math.abs(measured.actualPx - measured.declaredPx),
      `at ${width}px wide, sizes declares ${measured.declared} = ${measured.declaredPx}px but the image renders ${measured.actualPx}px`,
    ).toBeLessThan(0.02);
  }
});

test("/credits attributes all four outbound resources", async ({ page }) => {
  await page.goto("/credits");

  // Scoped to <main> so the sidebar's links cannot pad the count. Nothing else
  // on *this* page renders an absolute href, so this is exactly the credits
  // list -- the home hero renders two, which is why the scope is per-page and
  // not app-wide.
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
  // Recorded so an observed non-200, or a request that never answered at all, is
  // reported as itself. Without it the only symptom is `naturalWidth` being 0,
  // which says the image did not decode but not why -- see the note below on #78.
  //
  // Both outcomes are tracked, because they are different failures and a response
  // map alone cannot tell "answered badly" from "never answered".
  const optimiserStatus = new Map<string, number>();
  const optimiserFailed = new Map<string, string>();
  const optimiserType = new Map<string, string>();
  page.on("response", (response) => {
    if (response.url().includes("/_next/image")) {
      optimiserStatus.set(response.url(), response.status());
      optimiserType.set(
        response.url(),
        response.headers()["content-type"] ?? "",
      );
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/_next/image")) {
      optimiserFailed.set(
        request.url(),
        request.failure()?.errorText ?? "unknown failure",
      );
    }
  });

  await page.goto("/");
  const image = page.getByRole("img", { name: "Lan Playing Pool" });

  await expect(image).toBeVisible();

  // Keyed to the candidate this element actually settled on, not to "some
  // optimiser response was fine". The home page requests two optimised images --
  // this hero and the 48px header mark -- so a page-wide check is satisfiable by
  // the header alone while the hero's request has no response at all. An earlier
  // version of this test did exactly that, and it is the hole worth naming: the
  // count-plus-all-200 pair is nonempty but says nothing about *this* image.
  const currentSrc = await image.evaluate(
    (el: HTMLImageElement) => el.currentSrc,
  );

  // A load that never selected a source leaves this empty, which is itself the
  // diagnosis, so it is asserted rather than allowed to key a lookup that would
  // then fail for the wrong stated reason.
  expect(currentSrc, "the hero image never selected a source").not.toBe("");
  expect(
    currentSrc,
    "the hero image resolved to an unexpected resource",
  ).toContain("danPool");

  // Before the decode checks, so a request problem is reported as a request
  // problem. Ordering is the whole point: after `naturalWidth`, a 500 still
  // presents as "0 is not greater than 0" and these never run.
  expect(
    optimiserFailed.get(currentSrc),
    `the hero image request failed outright: ${currentSrc}`,
  ).toBeUndefined();
  expect(
    optimiserStatus.has(currentSrc),
    `no response was observed for the hero image: ${currentSrc}`,
  ).toBe(true);
  expect(
    optimiserStatus.get(currentSrc),
    "the hero image's optimiser response was not 200",
  ).toBe(200);

  // The format the browser was actually served, which is the only way to check
  // `images.formats` in next.config.ts as behaviour rather than as configuration.
  // Chromium advertises AVIF, so a response of anything else means the optimizer
  // declined to offer it -- which is what happens on the default
  // `formats: ["image/webp"]`, and it costs 20-32% of this image's bytes.
  //
  // Keyed to `currentSrc` like everything above it, and for the same reason: the
  // home page requests a second optimised image for the 48px header mark, so a
  // page-wide "some response was AVIF" would pass on the header alone while the
  // hero came back as WebP.
  //
  // Asserted with a prefix rather than equality, because a content-type may carry
  // parameters. It does not today.
  expect(
    optimiserType.get(currentSrc),
    "the hero image was not served as AVIF",
  ).toMatch(/^image\/avif\b/);

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

  // `naturalWidth` only proves the header parsed far enough to know the
  // dimensions, so a truncated body can satisfy it -- and a truncated body is
  // exactly the shape a failure under contention would take, with a 200 status to
  // go with it. `decode()` rejects on pixel data that cannot be decoded, which is
  // the one check here that a partial response cannot pass.
  await image.evaluate((el: HTMLImageElement) => el.decode());

  // #78 filed this test as flaky under full-suite load and guessed the race was
  // on `complete`, it being the only assertion with an unbounded external
  // dependency. The evidence points away from that. `page.goto` defaults to
  // `waitUntil: "load"` and playwright.config.ts sets no navigation timeout, so
  // for an eagerly-rendered image in the initial HTML the fetch is what `load`
  // waits on, and goto returns after it has settled. Measured immediately after
  // goto with no polling: `complete` already true and `naturalWidth` already 499,
  // in isolation and inside the full suite alike, goto itself taking 75-121ms.
  // Injecting an 8s delay on the optimiser made goto take 8s and the test still
  // passed rather than timing out.
  //
  // So on this evidence a merely slow image delays goto rather than failing the
  // assertions above, and a timeout would be reported against goto under the 30s
  // test budget. Stated as what was observed rather than as an impossibility
  // proof: no artifact of the original flake survives -- the only failed e2e run
  // in CI history at the time of writing is a different test -- so this is a
  // refuted hypothesis, not a diagnosed one.
  //
  // Note the 5s matcher budget applies to `toHaveJSProperty` above, not to the
  // bare `evaluate` calls, which are bounded only by the test timeout.
  //
  // What the checks above add is naming: an observed non-200, an outright request
  // failure, or a body that cannot be decoded now each report themselves instead
  // of arriving as "0 is not greater than 0". Deliberately not a raised timeout
  // and not a retry -- the issue argues against the first, and `retries: 0` is a
  // policy of this suite. A latency assertion would need an agreed threshold and
  // is not folded in here.

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
 * CI has no reCAPTCHA site key and has to stay that way, because no real key
 * belongs in this repo. That used to make the route unusable here: ContactForm
 * passed `sitekey={... || ""}`, Google's api.js threw `Missing required
 * parameters: sitekey` during hydration, and React unmounted the whole route --
 * measured, the field count dropped from 3 to 0. This suite passed anyway, by
 * aborting every google.com request so api.js never loaded and never threw. The
 * workaround was sound for the assertion it guarded, but it meant nothing here
 * observed the defect, and the same interception let the whole `<ReCAPTCHA>`
 * element be deleted with the suite still green.
 *
 * What the unmount looks like has since changed and the issue's description is
 * stale: error boundaries landed after #51 was filed, so the throw is caught and
 * the route renders the app's own "Something Went Wrong" boundary rather than
 * Next's raw "Application error" screen -- with `pageerror` empty. Measured
 * 2026-08-26 against a build of the pre-fix code. Do not read an empty page-error
 * list as health.
 *
 * #51 fixed the cause: with no key the widget is not constructed at all, and an
 * inline notice replaces it with submit disabled. So the interception is gone
 * from the test below, and its absence is now itself an assertion -- zero
 * requests to the captcha origins is evidence no widget was built, which is only
 * checkable because nothing is being blocked. It is evidence rather than proof:
 * it says nothing was fetched, and the unit tests are what actually observe the
 * props the widget would have received.
 *
 * Still rejected: passing a fake key. The old throw happened *because* api.js
 * loaded, so a fake key would make an online runner and an offline runner
 * disagree about whether this page works. That leaves the key-present path
 * **uncovered in a browser** -- the end-to-end test at the bottom of this file
 * is skipped, and a skipped test is a declared gap, not coverage. What does cover
 * it is ContactForm.test.ts, which stubs the widget to read the props it is
 * handed.
 *
 * The route is still covered twice: once for what the server sends, and once
 * for whether it comes alive in the browser and stays alive.
 */
test.describe("/contact", () => {
  // `javaScriptEnabled` is a browser-context option, so it needs its own block
  // rather than a line inside the test.
  test.describe("server-rendered, JavaScript disabled", () => {
    test.use({ javaScriptEnabled: false });

    test("sends the heading and the three fields the server action reads", async ({
      page,
    }) => {
      // Purely about the server's output, so it stays meaningful independently
      // of whatever the client bundle does with it.
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

  test("hydrates and stays alive with no reCAPTCHA key", async ({ page }) => {
    // Nothing is intercepted. Every request to the captcha's own origins is
    // recorded instead, and the assertion is that there were none.
    // `recaptcha.net` is included because react-google-recaptcha can be pointed
    // at it instead of google.com; we do not enable that, so it is here to keep
    // the measurement honest if someone ever does.
    const captchaRequests: string[] = [];
    page.on("request", (request) => {
      if (/(google\.com|gstatic\.com|recaptcha\.net)/.test(request.url())) {
        captchaRequests.push(request.url());
      }
    });

    await page.goto("/contact");

    // These two are the deterministic guard, and they are first on purpose:
    // both are in the server's HTML, so they hold from the first paint and
    // cannot race the unmount. Verified against a build of the old code -- this
    // is the pair that fails there.
    await expect(
      page.getByText("NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send Message" }),
    ).toBeDisabled();

    // The fields too, not just submit: a form that lets you type three fields
    // and then refuses to send them is worse than one that says up front it is
    // shut. Also all in the server's HTML, so equally race-free.
    await expect(page.locator('input[name="name"]')).toBeDisabled();
    await expect(page.locator('input[name="email"]')).toBeDisabled();
    await expect(page.locator('textarea[name="message"]')).toBeDisabled();

    // The widget was never constructed, so its script was never fetched. Read
    // after the network settles, or the list is empty merely because nothing has
    // had a chance to load yet. With no interception in this test, an empty list
    // is a measurement rather than a consequence of a route handler.
    await page.waitForLoadState("networkidle");
    expect(captchaRequests).toEqual([]);

    // Hydration, proved through public behaviour. Everything above is satisfied
    // by the server's HTML alone, so none of it can tell a hydrated page from
    // one whose bundle never ran. `requestSubmit()` is the way in: a disabled
    // submit button blocks clicking and Enter, but not a programmatic submit, so
    // React's `onSubmit` still fires and `handleSubmit` runs. The outcome message
    // appearing therefore proves the route hydrated and React bound the handler
    // -- the same thing the old click-based version of this test proved, via an
    // API that is public rather than via React's private `__react*` expandos.
    //
    // It doubles as the assertion that even a programmatic submit cannot send
    // unverified: with no widget mounted `getValue()` is undefined, which is the
    // branch that reports instead of calling the server action.
    //
    // The fields are deliberately not filled first, and cannot be -- they are
    // disabled, so `fill()` would wait for them to become editable and time out.
    // Nothing is lost: disabled controls are barred from constraint validation,
    // so their `required` attributes cannot block `requestSubmit()` either. An
    // earlier draft of this test filled them, from before the fields were
    // disabled too.
    //
    // This used to poll a `page.once("dialog")` listener for a native alert.
    // #120 replaced that alert, and the three toasts beside it, with one inline
    // live region -- so the oracle is the region's text. A dialog listener stays,
    // inverted: any dialog at all is now a failure, which is what stops `alert()`
    // coming back. It dismisses rather than merely recording, because a native
    // alert blocks the page and would otherwise turn this into a timeout instead
    // of an assertion.
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    const outcome = page.locator(
      'form:has(textarea[name="message"]) [aria-live="polite"]',
    );

    // The precondition, not decoration. Without it this test would also pass on a
    // build that server-rendered the message into the page and never hydrated;
    // asserting empty-then-populated is what makes it a transition rather than a
    // string match.
    await expect(outcome).toBeAttached();
    await expect(outcome).toBeEmpty();

    const submit = () =>
      page
        .locator('form:has(textarea[name="message"])')
        .evaluate((form: HTMLFormElement) => form.requestSubmit());

    await submit();

    await expect(outcome).toHaveText(
      "Please complete the reCAPTCHA challenge before sending.",
    );

    // A second press with nothing changed. The message is identical, so a naive
    // implementation re-renders the same text node, no DOM mutation occurs, and a
    // polite live region announces nothing -- silently, to the one reader who
    // pressed again because they did not hear it. The component keys the message
    // element on a counter for exactly this case; the observer is how that is
    // checked as behaviour rather than by reading the markup for a key React does
    // not emit. Measured: with the key removed, this counter stays at 0.
    //
    // `childList` only. The claim is that the message ELEMENT is replaced, and
    // watching characterData across the subtree as well would also count a text
    // edit in place -- which is the thing that does not reliably announce.
    //
    // What this does NOT establish is that a screen reader spoke. It establishes
    // the DOM change that a screen reader needs; no browser test in this repo can
    // observe the announcement itself.
    await outcome.evaluate((region: HTMLElement) => {
      const seen = { count: 0 };
      new MutationObserver((records) => {
        seen.count += records.length;
      }).observe(region, { childList: true });
      Object.assign(window, { __outcomeMutations: seen });
    });

    await submit();

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __outcomeMutations: { count: number } })
              .__outcomeMutations.count,
        ),
      )
      .toBeGreaterThan(0);

    // Still the same message: the point is that it was re-announced, not changed.
    await expect(outcome).toHaveText(
      "Please complete the reCAPTCHA challenge before sending.",
    );

    // No browser dialog across the two submits -- the listener is registered above
    // rather than before `goto`, so this says nothing about page load. That is the
    // window that matters: `alert()` lived in the submit handler. The message is in
    // the page, where it can be re-read, rather than in a modal that has to be
    // acknowledged to get rid of.
    expect(dialogs).toEqual([]);

    // Still nothing fetched from the captcha origins, now including across two
    // submit attempts.
    expect(captchaRequests).toEqual([]);

    // The symptom #51 described: these dropped to 0 as React unmounted the
    // route. Deliberately last, and deliberately not the load-bearing
    // assertion -- against the old build they pass, because the crash follows
    // api.js and the fields are briefly still there. That race is what the
    // original version of this file's comment warned about. They are kept
    // because they name the user-visible outcome, not because they catch it.
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Contact", level: 1 }),
    ).toBeVisible();
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

  // Present and correctly pointed, but not clicked. The original reason -- the
  // destination tore itself down without a reCAPTCHA key -- no longer holds
  // since #51, so following this link is now a reasonable thing to add. Left out
  // of this change because /contact's absence from the shared route list above
  // is load-bearing for several other tests in this file, and rewiring that is
  // not a captcha fix.
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

// A browser is the only instrument that sees this. The unit suite pins the token
// values, the class string and every call site, but all three can be right while
// the utility is never emitted -- narrow the Tailwind content globs and
// `bg-brand` silently resolves to no background at all. Nothing but a rendered
// page notices.
test("the header's auth button keeps its label readable", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("banner").getByRole("button");

  const { fg, resting, fontSize, fontWeight } = await button.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      fg: style.color,
      resting: style.backgroundColor,
      fontSize: parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight),
    };
  });

  await button.hover();
  // The button transitions colour over 150ms, so an immediate read returns the
  // resting colour still in flight and this reads as "hover changes nothing".
  await page.waitForTimeout(400);
  const hovered = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );

  const channels = (colour: string) =>
    (colour.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);

  const luminance = (colour: string) => {
    const [r, g, b] = channels(colour).map((value) => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  // Derived rather than hardcoded to 4.5: if the button is ever restyled larger
  // this relaxes to 3:1 the way the guideline does, instead of failing on a rule
  // that stopped applying.
  const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  const required = large ? 3 : 4.5;

  // A transparent background would compute to rgba(0, 0, 0, 0) and score a
  // *higher* ratio against a white label than any real fill, so the missing-CSS
  // case has to be excluded separately rather than caught by the ratio.
  for (const [state, background] of [
    ["resting", resting],
    ["hovered", hovered],
  ] as const) {
    expect(background, `${state} background is not painted`).not.toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(
      contrast(fg, background),
      `${state}: ${fg} on ${background} at ${fontSize}px/${fontWeight}`,
    ).toBeGreaterThanOrEqual(required);
  }

  // The fill is the button's only hover feedback, so collapsing the two states
  // onto one colour would leave the pointer unacknowledged.
  expect(hovered).not.toBe(resting);
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
  // would outrank the label and change the name, while the icon can still carry
  // a name of its own, so the name being right does not mean the label is what
  // made it right. Phosphor's `alt` prop renders an SVG `<title>`, which is a
  // name fallback exactly as the old raster icon's `alt` attribute was:
  // measured with the label stripped and the icon un-hidden, that `<title>`
  // alone puts the name at "Menu", and with no `<title>` it measures empty.
  await expect(toggle).toHaveAccessibleName("Menu");
  await expect(toggle).toHaveAttribute("aria-label", "Menu");

  // Neither line above can carry the decorative-icon claim: `aria-label`
  // outranks descendant content, so un-hiding the icon leaves the computed name
  // "Menu" and both assertions above green while the icon goes back to being a
  // node of its own inside the button. The claim is one fewer node, not a
  // duplicated announcement -- the name is unchanged either way.
  //
  // `img` with no `<img>` element inside the toggle: the icon is a bare `<svg>`,
  // which maps to that role once it is not hidden. The page does have a real
  // `<img>` -- the header's, from the root layout -- so this stays scoped to the
  // button rather than counting document-wide. The live mutation is dropping
  // `aria-hidden`, not the `alt`-shaped one the raster icon used to have --
  // mutation-tested, removing `aria-hidden="true"` fails this line and only this
  // line. Adding the `<title>` on its own is caught by nothing here, and there
  // is nothing to catch: while the SVG stays hidden it is out of the tree
  // whether it has a title or not.
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

// Geometry, read off the live layout rather than off class names. A class-name
// assertion would go green on a variant that is emitted but loses the cascade,
// which is the failure this group of tests exists to catch.
const boxes = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        top: Math.round(b.top),
        left: Math.round(b.left),
        right: Math.round(b.right),
        bottom: Math.round(b.bottom),
        width: Math.round(b.width),
        height: Math.round(b.height),
      };
    };
    return {
      nav: box(document.querySelector('nav[aria-label="Main"]')),
      menu: box(document.getElementById("sidebar-menu")),
      main: box(document.querySelector("main")),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

test("expanding the sidebar below `lg` overlays the content instead of pushing it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/credits");

  const toggle = mainNav(page).getByRole("button", { name: "Menu" });
  const collapsed = await boxes(page);

  await toggle.click();
  await expect(page.locator("#sidebar-menu")).toBeVisible();
  const expanded = await boxes(page);

  // The defect this replaces: the list was in flow, so opening it grew the
  // landmark and moved <main> down by the list's height. Both halves are pinned,
  // because either alone can be satisfied the wrong way -- a landmark that never
  // grows would still push content if the list escaped it downwards, and a <main>
  // that never moves would still be correct-by-accident if the panel were simply
  // never shown.
  expect(collapsed.main!.top).toBe(expanded.main!.top);
  expect(collapsed.nav!.height).toBe(expanded.nav!.height);

  // And it genuinely overlays: the panel's box has to intersect <main>'s. Without
  // this, a panel rendered into the gap beside the toggle would satisfy the two
  // assertions above while overlaying nothing. Both axes, because one alone is
  // not intersection -- a panel parked below <main>, or off to the side of it,
  // satisfies the vertical or the horizontal test on its own.
  expect(expanded.menu!.bottom).toBeGreaterThan(expanded.main!.top);
  expect(expanded.menu!.top).toBeLessThan(expanded.main!.bottom);
  expect(expanded.menu!.right).toBeGreaterThan(expanded.main!.left);
  expect(expanded.menu!.left).toBeLessThan(expanded.main!.right);
});

test("the collapsed sidebar below `lg` is no taller than its toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/credits");

  const { nav } = await boxes(page);
  const toggle = await mainNav(page)
    .getByRole("button", { name: "Menu" })
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

  // The landmark used to be a full-width band 32px taller than the control it
  // held, above every page on the site. Expressed as a relationship to the
  // toggle's own height rather than as a literal, so restyling the button does
  // not force this number to be retuned. Exact rather than an upper bound: 16px
  // is not slack, it is the strip's own 8px of padding above and below, so any
  // other number means the band has grown something it should not have.
  expect(nav!.height).toBe(toggle + 16);
});

test("the sidebar does not force a horizontal scrollbar at narrow widths", async ({
  page,
}) => {
  // 280px is the narrowest viewport any shipping device presents, and 320px the
  // narrowest anyone designs for. 240px is in the list because neither of those
  // exercises the defect: the landmark used to carry an unprefixed 250px width
  // floor, so the document could not lay out narrower than 250px whatever the
  // viewport was -- and every width at or above that satisfies this test whether
  // the floor is there or not. Mutation-tested: reinstating the floor fails only
  // the 240px iteration.
  //
  // Not extended below 240px, because a 221px floor remains at 200px and it is
  // the header's login control, not this landmark.
  for (const width of [240, 280, 320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/credits");

    const collapsed = await boxes(page);
    expect(
      collapsed.scrollWidth,
      `collapsed at ${width}px overflowed`,
    ).toBeLessThanOrEqual(collapsed.innerWidth);

    await mainNav(page).getByRole("button", { name: "Menu" }).click();
    await expect(page.locator("#sidebar-menu")).toBeVisible();

    // Asserted open as well as closed, and on the panel's own right edge as well
    // as on the document: the panel is out of flow, and an out-of-flow box that
    // overhangs the viewport does not always grow `scrollWidth`, so the document
    // check alone would miss a panel hanging off the side.
    const expanded = await boxes(page);
    expect(
      expanded.scrollWidth,
      `expanded at ${width}px overflowed`,
    ).toBeLessThanOrEqual(expanded.innerWidth);
    expect(
      expanded.menu!.right,
      `panel at ${width}px overhangs the viewport`,
    ).toBeLessThanOrEqual(width);
    // Both edges. Bounding the right edge alone passes an oversized panel that
    // has been shifted left, since a box hanging off the left does not grow
    // `scrollWidth` either.
    expect(
      expanded.menu!.left,
      `panel at ${width}px hangs off the left edge`,
    ).toBeGreaterThanOrEqual(0);
  }
});

test("the sidebar overlay is dismissible by Escape and by a click elsewhere", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/credits");

  const toggle = mainNav(page).getByRole("button", { name: "Menu" });
  const menu = page.locator("#sidebar-menu");

  await toggle.click();
  await expect(menu).toBeVisible();
  // Focus parked inside the panel, so the return is observable. Pressing Escape
  // with focus still on the toggle would leave it there anyway and prove nothing.
  await mainNav(page).getByRole("link", { name: "Blog" }).focus();
  await page.keyboard.press("Escape");

  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // The panel it came from is no longer laid out, so anything short of an
  // explicit restore leaves focus on the body and a keyboard reader at the top of
  // the document. `toBeFocused` rather than an activeElement snapshot so the
  // failure names the element.
  await expect(toggle).toBeFocused();

  await toggle.click();
  await expect(menu).toBeVisible();
  // Deep inside <main> and well clear of the panel, which at 375px is 250px wide
  // and about 250px tall.
  await page.mouse.click(320, 700);
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // The same dismissal with focus parked inside the panel. This is the case the
  // click above cannot see: there, focus was on the toggle and stayed put by
  // default, whereas here the element holding focus is about to stop being laid
  // out, and without a restore the reader is returned to the top of the document.
  await toggle.click();
  await expect(menu).toBeVisible();
  await mainNav(page).getByRole("link", { name: "Blog" }).focus();
  await page.mouse.click(320, 700);
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("the sidebar overlay does not trap focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/credits");

  const sidebar = mainNav(page);
  await sidebar.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("#sidebar-menu")).toBeVisible();

  // The absence of `role="dialog"` and of `[inert]` is asserted elsewhere, but
  // those are attributes: a focus trap written in JavaScript would leave every one
  // of them untouched. This walks out of the panel instead. Tabbing off the last
  // link has to leave the landmark, which is the whole behavioural difference
  // between the disclosure this is and the modal it is not.
  const links = sidebar.getByRole("link");
  await links.nth((await links.count()) - 1).focus();
  await page.keyboard.press("Tab");

  await expect(page.locator("#sidebar-menu")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        !!document.activeElement &&
        document
          .querySelector('nav[aria-label="Main"]')!
          .contains(document.activeElement),
    ),
  ).toBe(false);
});

test("the overlay adds no dialog semantics and no second control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/credits");

  const sidebar = mainNav(page);
  await sidebar.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("#sidebar-menu")).toBeVisible();

  // This is a disclosure. The scrim behind the panel is presentational, and the
  // dismissing click is caught on the document rather than on it, so nothing new
  // should have reached the accessibility tree while the panel is open -- which
  // is also what keeps the `lg`-and-above test above able to assert on a single
  // button in this landmark.
  await expect(sidebar.locator("button")).toHaveCount(1);
  await expect(page.getByRole("navigation")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[aria-modal], [inert]")).toHaveCount(0);
});

test("the sidebar column at `lg` is unaffected by the overlay styling", async ({
  page,
}) => {
  // The component renders in the root layout, so it is on every page and a
  // regression here would be site-wide. The overlay is expressed as unprefixed
  // utilities with prefixed desktop counterparts, which is exactly the
  // arrangement where a missing prefix leaks downward-styling into this column.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/credits");

  const { nav, menu, main } = await boxes(page);

  // Pinned as literals, not as a relationship: these are the numbers the desktop
  // layout has always produced, and the point is that they did not move.
  expect(nav).toMatchObject({ left: 0, width: 250 });
  expect(main!.left).toBe(250);
  // 250px of column minus 16px of padding on each side.
  expect(menu).toMatchObject({ left: 16, width: 218 });

  const computed = await page.evaluate(() => {
    const el = document.querySelector('nav[aria-label="Main"]')!;
    const list = document.getElementById("sidebar-menu")!;
    return {
      position: getComputedStyle(el).position,
      padding: getComputedStyle(el).padding,
      background: getComputedStyle(el).backgroundColor,
      listPosition: getComputedStyle(list).position,
    };
  });
  // The four properties the overlay sets below the breakpoint, each asserted back
  // at its desktop value. A geometry-only check would pass on a column that had
  // been made a positioning context or lost its fill.
  expect(computed).toEqual({
    position: "static",
    padding: "16px",
    background: "rgb(39, 39, 42)",
    listPosition: "static",
  });
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
// The status is the entire claim of the `[id]/layout.tsx` lookup, and it cannot
// be checked here for the same reason: an unknown id still costs a query, so
// without credentials the route throws into its error boundary instead of
// answering 404, and a status assertion would be measuring the wrong failure.
// Verified by hand against a real database instead -- GET and HEAD both 404,
// recorded on #52.
test.skip(
  "/blog/[id] answers 404 for an unknown id (needs a database -- see #3)",
  unimplemented("an unknown id still needs a blogs table to come back empty"),
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
 * no visibility check can see. So `> 0` was unfalsifiable and a magnitude is not.
 *
 * What that buys is narrow, and worth stating so nobody reads more into a pass:
 * it pins the two constants and nothing else. It does not establish that 120x75
 * is *usable* — see the comment on `minCanvasHeight`, where it is not — and any
 * larger canvas passes too.
 *
 * The margins are exactly zero, which is the point rather than an oversight: at
 * this viewport the branch computes -1.39 and -114, so both floors apply and the
 * received values are precisely 120 and 75. Lowering either floor by one pixel
 * fails here.
 *
 * Measured via `getBoundingClientRect`, not the `width`/`height` attributes. p5
 * calls `pixelDensity(window.devicePixelRatio)`, so those attributes are
 * backing-store pixels — 2x the floors at DPR 2 — while the floors are logical
 * dimensions. The Chromium project runs at DPR 1, so the two happen to coincide
 * today and the distinction is invisible; the rect is the quantity actually meant.
 */
test("the p5 canvas survives a window shorter than the reserved height", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 186 });
  await page.goto("/animation");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

  const size = await page.evaluate(() => {
    const rect = document.querySelector("canvas")?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
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
 *
 * 320 is the narrowest width this suite covers, not a support boundary the repo
 * declares anywhere. It is also not where the floor stops fitting: the container
 * here is 288px, so any floor up to 288 still passes, and the floor only exceeds
 * its container below a 152px viewport. This catches the plausible mutation, not
 * every one.
 *
 * `getBoundingClientRect`, again, because `canvas.width` is backing-store pixels
 * against a CSS-pixel `clientWidth` — a comparison that is only correct at DPR 1.
 */
test("the p5 canvas fits its container at the narrowest width covered here", async ({
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
      canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
      containerWidth: canvas?.parentElement?.clientWidth ?? 0,
    };
  });

  expect(measurements.overflow).toBe(0);
  expect(measurements.canvasWidth).toBeLessThanOrEqual(
    measurements.containerWidth,
  );
});

/**
 * #80: on a short landscape viewport the tank collapsed to a sliver and drew its
 * fish below the bottom edge. Measured on the pre-fix build at this exact
 * viewport: a 302x75 canvas, a delivered ratio of 4.027 against a 1.605 design
 * space, and **none** of the eight countable fish rendering a single pixel.
 *
 * The ratio is the assertion that would have caught it, and it is the one worth
 * keeping: every fish Y is a base-space coordinate divided by a *width* ratio, so
 * a canvas that is too short for its width puts the lower fish outside it. Fish
 * presence is asserted too, since the ratio alone would not notice them being
 * moved.
 *
 * `reduce` is emulated so the fish are placed by the resting layout and held,
 * which makes this deterministic rather than a race against the swim-in.
 */
test("the tank keeps its proportions and its fish on a short landscape viewport", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/animation");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await canvasOf(page);

  const FISH_BODY_COLOURS = [
    [128, 0, 128],
    [0, 255, 255],
    [255, 0, 0],
    [0, 128, 128],
    [255, 102, 102],
    [255, 128, 128],
    [0, 153, 153],
    [255, 153, 51],
  ];

  const measured = await page.evaluate((colours) => {
    const canvas = document.querySelector("canvas");
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return null;

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      ratio: canvas.width / canvas.height,
      bodyPixels: colours.map(([r, g, b]) => {
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] === r && data[i + 1] === g && data[i + 2] === b) n++;
        }
        return n;
      }),
    };
  }, FISH_BODY_COLOURS);

  // 1180/735. Tolerance covers the integer rounding p5 applies to the two
  // dimensions; the defect this guards was off by 2.5x, not by a rounding error.
  expect(measured!.ratio).toBeCloseTo(1180 / 735, 1);

  // Deliberately not the 50-pixel threshold the still-frame test uses. Fish scale
  // with the canvas, and at 302px wide the smallest body is ~11 pixels, so 50
  // would fail against a correct render. The claim here is "drawn at all", and
  // the fills are exact so antialiasing does not contribute matches.
  for (const [index, pixels] of measured!.bodyPixels.entries()) {
    expect(pixels, `fish ${index} is not on the canvas`).toBeGreaterThanOrEqual(
      3,
    );
  }
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
