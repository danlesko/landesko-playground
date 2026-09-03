import type { NextConfig } from "next";

// No CORS headers: every API route is called same-origin from this app, so
// nothing needs cross-origin access. The previous block applied
// `Access-Control-Allow-Origin: *` together with
// `Access-Control-Allow-Credentials: true` to all of /api/*, including the
// next-auth handler.

// NO `turbopack.resolveAlias` for p5 any more, and its absence is the change
// rather than an oversight.
//
// It existed for #16. p5 1.x's `main` is a minified UMD build whose minifier
// reuses the name `o` for both a defaulted parameter and a `var` inside the same
// function body -- legal, since `var` may redeclare a parameter -- and Turbopack
// downlevelled the defaulted parameter into a body-level `let o`, which collided.
// The whole p5 chunk failed to parse with `SyntaxError: Identifier 'o' has
// already been declared` and the canvas never mounted. Aliasing p5 to its
// unminified `lib/p5.js` sidestepped it, at the cost of a 5.2MB file in place of
// a 1MB one.
//
// Two things changed in Next 16. Turbopack became the default builder for
// `next build`, so an alias that only ever affected `next dev` would now have
// applied to production too. And the bug is gone: with the alias removed the
// canvas mounts at 1178x734 with no redeclaration error, in `next build` +
// `next start` AND in `next dev`, which is where it originally showed. Checked
// the dev server log as well as the browser console.
//
// So removing it is worth 368,473 bytes of client JavaScript -- 2,092,396 down to
// 1,723,923 across `.next/static/chunks`, -17.6%. Much less than the 5.2MB vs 1MB
// file sizes suggest, because production minification recovers most of the
// difference; the honest figure is +369KB for keeping it, not 5x.
//
// If the parse error ever returns, `e2e/smoke.spec.ts` fails on the canvas rather
// than reporting a bundle size, which is the right signal: the alias was never
// about bytes.

const nextConfig: NextConfig = {
  // `formats` defaults to `["image/webp"]`, which is why the optimizer answered
  // with WebP even when the browser advertised AVIF: an unlisted format is never a
  // candidate. Adding AVIF is what changes the outcome -- NOT putting it first.
  // Next hands this array to `@hapi/accept`'s `mediaType`, so the client's own
  // q-weighting decides between the listed formats; a client that genuinely
  // prefers WebP still gets WebP. WebP stays listed for clients without AVIF, and
  // a client accepting neither gets the source format re-encoded.
  //
  // Applies to EVERY optimized image, not just the hero -- `slide.png`, the header
  // mark in layout.tsx, now has an AVIF variant too. Checked rather than assumed:
  // its alpha channel survives the round trip, and at its rendered size the two
  // are indistinguishable side by side.
  //
  // Measured against a local production build, `/_next/image?url=...&q=75`, at the
  // widths a browser actually requests. RMS is the per-channel difference between
  // the decoded AVIF and the decoded WebP, 0-255:
  //
  //     candidate      WebP     AVIF     saving   RMS
  //     hero  640w    23,562   17,041    -27.7%   3.10
  //     hero 1080w    45,924   34,441    -25.0%   2.42
  //     hero 1920w    60,014   46,255    -22.9%   2.30
  //     mark   96w     3,522    2,116    -39.9%   8.43
  //
  // RE-MEASURED for #125, which is exactly the trigger the previous version of
  // this comment asked for: Next 16 declares `sharp: ^0.35.4` where 15 declared
  // `^0.34.3`, so upgrading the framework moved the encoder. The old table, taken
  // on 0.34.5, read 18,899 / 32,550 / 40,622 / 2,499 at RMS 2.61 / 2.08 / 1.95 /
  // 7.15. The WebP column did not move at all, which localises the change to the
  // AVIF path.
  //
  // TWO things moved on that path, not one, and an earlier draft of this comment
  // wrongly credited it all to sharp. Next 16 also lowered the AVIF quality it
  // requests, from 55 to 47 for a `q=75` URL -- see the note further down. So the
  // smaller bytes and the slightly higher RMS are the combined effect of a new
  // encoder AND a lower quality target, and this table cannot separate them.
  //
  // AVIF is still smaller at every width, so #121's decision stands. Note that the
  // previous comment recorded a 0.35.4 trial coming out LARGER than WebP at two of
  // three widths (22,489 / 47,764 / 68,074); that does not reproduce here. Same
  // sharp version, different result, so something else in the 16 image pipeline
  // differs too -- worth knowing before treating a lone sharp bump as predictive.
  //
  // The local numbers now agree with production, where before they did not. The
  // old comment recorded www.landesko.dev serving 17,058 / 34,347 / 46,255 for the
  // three hero widths against a local table of 18,899 / 32,550 / 40,622; this
  // table reads 17,041 / 34,441 / 46,255, matching the 1920w figure to the byte.
  // One reading is that Vercel was already running a newer sharp and this upgrade
  // brings local into line with it. A second is that Vercel was already applying
  // Next 16's quality formula. Both would produce agreeing bytes and this
  // measurement cannot choose between them, so treat the agreement as a useful
  // coincidence rather than as an identified cause -- agreeing bytes are evidence
  // of agreeing OUTPUT, not of an agreeing pipeline.
  //
  // Re-measure if sharp moves again. It is not a property of the codec choice
  // alone, and nothing in the suite would notice --
  // the e2e assertion pins the negotiated FORMAT, not the byte count.
  //
  // Whether any of this reaches a visitor is a separate question and not one this
  // repository can answer. The differing production bytes are consistent with
  // Vercel optimizing images on its own infrastructure rather than through this
  // sharp, but that is circumstantial: a different byte count proves different
  // output, not a different encoder.
  //
  // NOT free of a quality judgement, which is worth being exact about because an
  // earlier version of this comment claimed it was, and because #125 changed the
  // number. Next 15 asked sharp for AVIF at `quality - 20`, so a `q=75` request
  // was AVIF quality 55 against WebP's 75. Next 16 computes
  // `Math.max(Math.round(quality * (50 / 80)), 1)` instead
  // (`server/image-optimizer.js`), so the same request is now quality 47. Part of
  // the saving above is therefore a lower quality target rather than pure codec
  // efficiency, and a larger part of it than before.
  //
  // The RMS column and a side-by-side look are the evidence that it does not show,
  // and both were RE-TAKEN for #125 rather than carried over, because the quality
  // target moved: a 520px 1:1 crop of the 1080w candidate, WebP 75 beside AVIF 47,
  // is marginally softer in the hair and in the background poster and otherwise
  // indistinguishable. No blocking, no banding, no colour shift -- and the page
  // renders that candidate smaller than 1:1, so this looks at it harder than a
  // reader does. The mark's hard edges are intact.
  //
  // This is deliberately NOT the "re-encode public/danPool.jpeg" that #8 asks for,
  // and the reason is that a normal page load never downloads that file --
  // `<Image>` serves derived candidates. It is still publicly routable at
  // /danPool.jpeg, and Next falls back to the source if optimization fails, so
  // "never served" would be too strong. Leaving it alone keeps one lossy
  // generation between the camera and the reader instead of two; every delivered
  // AVIF is still a lossy derivative of it.
  //
  // Cost. Measured with a fresh server process and `.next/cache/images` emptied
  // for each format, so neither warmed the other: the first-ever 640w request was
  // 0.096s for AVIF against 0.082s for WebP, and a second request at 1080w with
  // sharp already warm was 0.075s against 0.087s. So ~14ms on a cold encode at the
  // size desktop Chrome selects. Local sharp only -- Vercel's optimizer and its
  // cache lifetimes are its own, and a cold encode is not once per deployment: the
  // cache key includes the negotiated MIME type, and entries expire and are
  // evicted.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
