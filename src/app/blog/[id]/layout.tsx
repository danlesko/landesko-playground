import { notFound } from "next/navigation";
import { getSession, loadBlog } from "./loaders";

/**
 * Exists only to decide the HTTP status, and it has to be a layout to do it.
 *
 * `notFound()` from `page.tsx` alone returns **200**. Any Suspense boundary
 * above the throw lets Next flush the shell first, and once bytes are sent the
 * status is already committed -- so `loading.tsx` turns the 404 into a 200 with
 * a 404 body streamed in after it. Search engines and `curl -I` see success.
 *
 * The lookup therefore has to happen above every boundary on the route, which
 * means a layout: layouts render before the `loading.tsx` of their own segment.
 * It must be *this* segment's layout, because a layout only receives params
 * from its own segment and above -- `/blog`'s layout never sees `id` at all.
 *
 * This costs the route its streaming: TTFB becomes the lookup time, measured at
 * ~31ms warm and ~160ms on a cold connection, because `getBlog` is one HTTPS
 * round trip and no more (it times the same as `SELECT 1`). The full
 * measurement is on issue #52. It buys a truthful status on every non-RSC
 * request, and it costs no extra query: `loadBlog` is the same memo `page.tsx`
 * and `generateMetadata` use, so all three share one lookup.
 */
export default async function BlogPostLayout(props: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const session = await getSession();

  // Unknown id and a private post requested without a session both arrive as
  // undefined, and both must stay indistinguishable -- otherwise a 404 versus a
  // 403 would confirm which private posts exist.
  if (!(await loadBlog(session, id))) {
    notFound();
  }

  return props.children;
}
