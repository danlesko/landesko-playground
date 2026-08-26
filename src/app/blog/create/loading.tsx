import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import { contentColumnClasses } from "@/components/ui/layout";

const loadingSkeleton = () => {
  return (
    <div className={`animate-pulse mt-2 ${contentColumnClasses}`}>
      <div className="h-10 bg-muted rounded mb-2"></div>
      <div className="h-[500px] bg-muted rounded mb-2"></div>
      <div className="h-10 bg-muted rounded"></div>
    </div>
  );
};

const Loading = () => {
  return (
    <>
      <PageHeading>Create New Blog Post</PageHeading>
      <BackLink />
      {loadingSkeleton()}
    </>
  );
};

export default Loading;
