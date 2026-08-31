import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import CreateBlogForm from "./CreateBlogForm";
import { contentColumnClasses } from "@/components/ui/layout";

const CreateBlogPage = () => {
  return (
    <div className={contentColumnClasses}>
      <PageHeading>Create New Blog Post</PageHeading>
      <BackLink />
      <CreateBlogForm />
    </div>
  );
};

export default CreateBlogPage;
