import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";

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
      <PageHeading>Blog Posts</PageHeading>
      <BackLink />
      {loadingSkeleton()}
    </>
  );
};

export default Loading;
