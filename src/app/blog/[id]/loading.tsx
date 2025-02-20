import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

const LoadingSkeletons = () => {
  return (
    <div className="mt-4 p-4 border border-white shadow-sm rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse">
      <div className="h-6 bg-gray-300 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
    </div>
  );
};

export default function Loading() {
  return (
    <>
      <h2 className="text-4xl font-bold">Blog Posts</h2>
      <Link
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600 font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
      <LoadingSkeletons />
    </>
  );
}
