import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

const LoadingSkeletons = () => {
  return (
    <div className="mt-4 p-4 border border-border shadow-sm rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse">
      <div className="h-6 bg-surface rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-surface rounded w-full mb-2"></div>
      <div className="h-4 bg-surface rounded w-full mb-2"></div>
    </div>
  );
};

export default function Loading() {
  return (
    <>
      {/* The real heading is the post title, which isn't known yet. */}
      <h2 className="text-4xl font-bold">
        <span className="sr-only">Loading blog post</span>
        <span
          aria-hidden="true"
          className="block h-10 w-3/4 lg:w-1/3 bg-surface rounded animate-pulse"
        ></span>
      </h2>
      <Link
        className="text-xl text-accent hover:text-accent-hover visited:text-accent-visited font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      <LoadingSkeletons />
    </>
  );
}
