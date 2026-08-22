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
 * Caching `auth` is what makes caching `getBlog` work at all: `cache` keys on
 * argument identity, so `loadBlog(session, id)` calls only collapse if every
 * caller receives the very same session object. Uncached, `auth()` returns a
 * fresh one each time and every lookup would miss.
 */
export const getSession = cache(auth);
export const loadBlog = cache(getBlog);
