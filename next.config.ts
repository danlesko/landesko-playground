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

  // `formats` defaults to `["image/webp"]`, so the optimizer answered every
  // request with WebP even when the browser advertised AVIF. Order is preference
  // order: AVIF to anything that accepts it, WebP to everything else, and JPEG to
  // a client that asks for neither.
  //
  // Measured against a production build, `/_next/image?url=%2FdanPool.jpeg&q=75`,
  // the same widths a browser actually requests for the hero:
  //
  //     width   WebP     AVIF     saving
  //      640    23,562   18,899   -20%
  //     1080    45,924   32,550   -29%
  //     1920    60,014   40,622   -32%
  //
  // The WebP column matched what www.landesko.dev was serving to within 4 bytes,
  // which is what makes the AVIF column trustworthy as a local number. Vercel runs
  // its own optimizer rather than this sharp, so production bytes will differ a
  // little; the format it picks is what this line decides.
  //
  // This is deliberately NOT the "re-encode public/danPool.jpeg" that #8 asks for.
  // The 291,380-byte source is never sent to a visitor -- `<Image>` serves derived
  // candidates, none over 60 kB -- so re-encoding it would change repository size
  // and nothing a reader downloads. It also stays byte-identical here, which means
  // no second lossy pass over the original photograph.
  //
  // Cost, since AVIF encoding is usually the objection: measured cold, AVIF was
  // 0.077s at 1080 and 0.069s at 1920 against WebP's 0.092s and 0.100s -- not
  // slower at these sizes. Warm was ~2ms for both. The first encode of any size is
  // once per deployment, and the hero's candidates are requested on the first hit
  // of the home page.
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
