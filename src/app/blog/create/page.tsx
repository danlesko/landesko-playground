import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import CreateBlogForm from "./CreateBlogForm";

const CreateBlogPage = () => {
  return (
    <>
      <PageHeading>Create New Blog Post</PageHeading>
      <BackLink />
      <CreateBlogForm />
    </>
  );
};

export default CreateBlogPage;
