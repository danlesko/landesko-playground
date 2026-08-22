import { cache } from "react";
import { auth } from "@/auth";
import { getBlog } from "@/lib/data";

/**
 * Shared per-request memos for the post detail route.
 *
 * These live in their own module because `cache` returns a *new* memo on every
 * call, so `cache(getBlog)` written separately in the layout and in the page
 * would be two independent memos and two round trips. Exported once and
 * imported by both, `layout.tsx`, `page.tsx` and `generateMetadata` share a
 * single lookup per request.
 *
 * Caching `auth` is what makes caching `getBlog` work *for a signed-in reader*:
 * `cache` keys on argument identity, so `loadBlog(session, id)` calls only
 * collapse if every caller receives the very same session object, and an
 * uncached `auth()` returns a fresh one each time. Anonymous readers would
 * dedupe either way — `auth()` resolves to `null`, and a primitive is its own
 * identity. So this is not load-bearing on the common path, which is exactly why
 * it would be easy to remove and not notice.
 */
export const getSession = cache(auth);
export const loadBlog = cache(getBlog);
