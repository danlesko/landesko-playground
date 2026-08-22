import { cache } from "react";
import { getBlog } from "@/lib/data";

export { getSession } from "@/lib/session";

/**
 * The shared per-request post lookup for this route.
 *
 * It lives in its own module because `cache` returns a *new* memo on every call,
 * so `cache(getBlog)` written separately in the layout and in the page would be
 * two independent memos and two round trips. Exported once and imported by both,
 * `layout.tsx`, `page.tsx` and `generateMetadata` share a single lookup.
 *
 * The session re-export is what makes that work *for a signed-in reader*:
 * `cache` keys on argument identity, so `loadBlog(session, id)` calls only
 * collapse if every caller receives the very same session object, and an
 * uncached `auth()` returns a fresh one each time. Anonymous readers would
 * dedupe either way — `auth()` resolves to `null`, and a primitive is its own
 * identity. So it is not load-bearing on the common path, which is exactly why
 * it would be easy to remove and not notice.
 *
 * It re-exports `@/lib/session` rather than wrapping `auth` again, because the
 * root layout renders above this route and needs the same session: a second
 * `cache(auth)` here would be a second memo, and the two reads could disagree.
 */
export const loadBlog = cache(getBlog);
