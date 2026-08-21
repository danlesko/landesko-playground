import PageHeading from "@/components/ui/PageHeading";

// Ten to match the LIMIT in fetchRecentBlogs.
const LoadingSkeletons = () => {
  return Array.from({ length: 10 }, (_, index) => (
    <div
      key={index}
      className="mt-4 p-4 border border-border shadow-sm rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse"
    >
      <div className="h-6 bg-surface rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-surface rounded w-full mb-2"></div>
      <div className="h-4 bg-surface rounded w-full mb-2"></div>
    </div>
  ));
};

export default function Loading() {
  return (
    <>
      <PageHeading>Blog Posts</PageHeading>
      <LoadingSkeletons />
    </>
  );
}
