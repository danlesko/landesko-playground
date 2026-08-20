import BackLink from "@/components/ui/BackLink";

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
      <h2 className="text-4xl font-bold">Create New Blog Post</h2>
      <BackLink />
      {loadingSkeleton()}
    </>
  );
};

export default Loading;
