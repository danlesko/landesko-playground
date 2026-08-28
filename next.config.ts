import type { NextConfig } from "next";

// No CORS headers: every API route is called same-origin from this app, so
// nothing needs cross-origin access. The previous block applied
// `Access-Control-Allow-Origin: *` together with
// `Access-Control-Allow-Credentials: true` to all of /api/*, including the
// next-auth handler.

// p5 1.x resolves to a minified UMD build (`lib/p5.min.js`, its `main`), whose
// minifier reuses the name `o` for both a defaulted parameter and a `var` inside
// the same function body. That is legal — `var` may redeclare a parameter — but
// Turbopack's transform downlevels the defaulted parameter into a body-level
// `let o`, which then collides with the `var o`. The whole p5 chunk fails to
// parse with `SyntaxError: Identifier 'o' has already been declared`, and the
// canvas never mounts (#16).
//
// The package also ships an unminified `lib/p5.js`: the same library and version
// from the same source, but with real identifiers, so there is nothing to
// collide. Only Turbopack rewrites the bundle, so only Turbopack needs
// redirecting — `next build` and `next dev` without `--turbopack` both pass
// p5.min.js through untouched and already work, which is why there is no
// matching `webpack.resolve.alias`. Left ungated so that a future
// `next build --turbopack` inherits the fix instead of silently regressing.
//
// Tradeoff: the unminified build is ~5.2MB rather than ~1MB and, because it has
// no `IS_MINIFIED` guard, it runs p5's Friendly Error System parameter
// validation. That costs some dev-time work; it reports nothing for this sketch.
// Aliasing here rather than importing `p5/lib/p5.js` at the call site keeps
// `react-p5-wrapper`, which hard-imports bare `p5` and cannot take an injected
// instance.
const nextConfig: NextConfig = {
  turbopack: { resolveAlias: { p5: "p5/lib/p5.js" } },

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
  //     hero  640w    23,562   18,899    -19.8%   2.61
  //     hero 1080w    45,924   32,550    -29.1%   2.08
  //     hero 1920w    60,014   40,622    -32.3%   1.95
  //     mark   96w     3,522    2,499    -29.0%   7.15
  //
  // The WebP column matched what www.landesko.dev serves to within 4 bytes, so the
  // local procedure reproduces production for that format. That does not make the
  // AVIF byte counts a production figure: Vercel runs its own optimizer, so its
  // sizes will differ. What this line decides is the format; the magnitude is a
  // local measurement.
  //
  // NOT free of a quality judgement, which is worth being exact about because an
  // earlier version of this comment claimed it was. Next asks sharp for AVIF at
  // `quality - 20` with `effort: 3`, so a `q=75` request is AVIF quality 55
  // against WebP's 75 -- the -20 is the codec heuristic, not an identity. Part of
  // the saving above is therefore a lower quality target rather than pure codec
  // efficiency. The RMS column and a side-by-side look are the evidence that it
  // does not show: no visible artefact, no colour shift, and the mark's hard edges
  // are intact.
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
