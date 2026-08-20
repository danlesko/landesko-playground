import PageHeading from "@/components/ui/PageHeading";
import CardSkeleton from "@/components/ui/CardSkeleton";

const LoadingSkeletons = () => {
  return new Array(10).fill(<CardSkeleton />);
};

export default function Loading() {
  return (
    <>
      <PageHeading>Blog Posts</PageHeading>
      <LoadingSkeletons />
    </>
  );
}
