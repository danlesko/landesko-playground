import { Input, Textarea, Button, Checkbox } from "@rewind-ui/core";
import { createBlog } from "@/lib/actions";
import BackLink from "@/components/ui/BackLink";
import PageHeading from "@/components/ui/PageHeading";
import { formControlClasses, formLabelClasses } from "@/components/ui/form";

const CreateBlogPage = () => {
  return (
    <>
      <PageHeading>Create New Blog Post</PageHeading>
      <BackLink />
      <form
        className="text-lg mt-2 md:w-full lg:min-w-[600px] lg:w-1/2"
        action={createBlog}
      >
        <label htmlFor="blog-title" className={formLabelClasses}>
          Title
        </label>
        <Input
          required
          id="blog-title"
          type="text"
          name="title"
          color="purple"
          className={`${formControlClasses} mt-1`}
        />

        <label htmlFor="blog-content" className={formLabelClasses}>
          Content
        </label>
        <Textarea
          required
          id="blog-content"
          className={`h-[500px] ${formControlClasses} mt-1`}
          tone="solid"
          color="purple"
          placeholder="What's On Your Mind?"
          name="content"
        />

        <Checkbox
          name="private"
          color="purple"
          defaultChecked
          label="Make this post private"
        />

        <Button variant="primary" type="submit" className="mt-2 font-bold">
          Create Post
        </Button>
      </form>
    </>
  );
};

export default CreateBlogPage;
