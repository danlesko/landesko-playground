"use client";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import Card from "@/components/ui/Card";

export default function Error() {
  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <PageHeading className="text-danger">Error Fetching Blog</PageHeading>
      <BackLink />
      <Card>
        <p className="whitespace-pre-line">
          An error occurred while fetching the blog post for the given URL.
          Please make sure that the URL is valid and that you have the
          permission to view the blog by signing in.
        </p>
      </Card>
    </div>
  );
}
