import type { Metadata } from "next";
import { Suspense } from "react";
import BlogList, { BlogListSkeleton } from "./BlogList";

export const metadata: Metadata = {
  title: "Landesko's Playground - Blog",
  description: "Blog Posts",
};

// The skeleton is declared here rather than in a `loading.tsx`, and that is the
// whole point of this file's shape. A `loading.tsx` beside it would sit at the
// `/blog` segment, so its boundary would cover `/blog/[id]` as well and would
// flush the shell before that route's layout could set a 404. A `<Suspense>`
// declared inside a sibling `page.tsx` creates no boundary over a child segment,
// so the list keeps streaming and the detail route keeps its status.
// The searchParams promise is passed down rather than awaited here, which keeps
// this shell synchronous. Awaiting it would suspend this component above its own
// <Suspense>, and the fallback of a boundary you are rendering cannot cover you --
// so the skeleton would never show.
export default function Blog({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  return (
    <div>
      <Suspense fallback={<BlogListSkeleton />}>
        <BlogList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
