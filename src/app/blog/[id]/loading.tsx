import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import CardSkeleton from "@/components/ui/CardSkeleton";

export default function Loading() {
  return (
    <>
      <PageHeading>Blog Posts</PageHeading>
      <BackLink />
      <CardSkeleton />
    </>
  );
}
