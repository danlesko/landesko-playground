import Link from "next/link";

const loadingSkeleton = () => {
  return (
    <div className="animate-pulse mt-2 md:w-full lg:min-w-[600px] lg:w-1/2">
      <div className="h-10 bg-zinc-800 rounded mb-2"></div>
      <div className="h-[500px] bg-zinc-800 rounded mb-2"></div>
      <div className="h-10 bg-zinc-800 rounded"></div>
    </div>
  );
};

const Loading = () => {
  return (
    <>
      <h2 className="text-4xl font-bold">Blog Posts</h2>
      <Link
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600"
        href={`/blog`}
      >
        &larr; All Blog Posts
      </Link>
      {loadingSkeleton()}
    </>
  );
};

export default Loading;
