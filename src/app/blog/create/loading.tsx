import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

const loadingSkeleton = () => {
  return (
    <div className="animate-pulse mt-2 md:w-full lg:min-w-[600px] lg:w-1/2">
      <div className="h-10 bg-surface rounded mb-2"></div>
      <div className="h-[500px] bg-surface rounded mb-2"></div>
      <div className="h-10 bg-surface rounded"></div>
    </div>
  );
};

const Loading = () => {
  return (
    <>
      <h2 className="text-4xl font-bold">Blog Posts</h2>
      <Link
        className="text-xl text-accent hover:text-accent-hover visited:text-accent-visited font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      {loadingSkeleton()}
    </>
  );
};

export default Loading;
