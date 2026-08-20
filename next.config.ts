import type { NextConfig } from "next";

// No CORS headers: every API route is called same-origin from this app, so
// nothing needs cross-origin access. The previous block applied
// `Access-Control-Allow-Origin: *` together with
// `Access-Control-Allow-Credentials: true` to all of /api/*, including the
// next-auth handler.

// p5 1.x ships only a minified UMD build (`lib/p5.min.js`), and its minifier
// reuses the name `o` for both a defaulted parameter and a `var` inside the same
// function body. That is legal — `var` may redeclare a parameter — but
// Turbopack's transform downlevels the defaulted parameter into a body-level
// `let o`, which then collides with the `var o`. The whole p5 chunk fails to
// parse with `SyntaxError: Identifier 'o' has already been declared`, and the
// canvas never mounts (#16).
//
// p5's unminified build is the same library from the same source with real
// identifiers, so there is nothing to collide. Only Turbopack rewrites the
// bundle, so only Turbopack needs redirecting: `next build` and `next dev`
// without `--turbopack` both pass p5.min.js through untouched and already work,
// which is why this is not also a `webpack.resolve.alias`. It is deliberately
// left ungated so that a future `next build --turbopack` inherits the fix rather
// than silently regressing. `react-p5-wrapper` hard-imports `p5` with no way to
// inject an instance, so the resolver is the only place to intervene.
const nextConfig: NextConfig = {
  turbopack: { resolveAlias: { p5: "p5/lib/p5.js" } },
};

export default nextConfig;
