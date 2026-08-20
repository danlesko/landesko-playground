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
};

export default nextConfig;
