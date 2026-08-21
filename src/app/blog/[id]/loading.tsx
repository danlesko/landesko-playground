import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";

const LoadingSkeletons = () => {
  return (
    <div className="mt-4 p-4 border border-border shadow-sm rounded-lg lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse">
      <div className="h-6 bg-muted rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-muted rounded w-full mb-2"></div>
      <div className="h-4 bg-muted rounded w-full mb-2"></div>
    </div>
  );
};

export default function Loading() {
  return (
    <>
      {/* The real heading is the post title, which isn't known yet. */}
      <PageHeading>
        <span className="sr-only">Loading blog post</span>
        <span
          aria-hidden="true"
          className="block h-10 w-3/4 lg:w-1/3 bg-muted rounded animate-pulse"
        ></span>
      </PageHeading>
      <BackLink />
      <LoadingSkeletons />
    </>
  );
}
