import { Input, Textarea, Button } from "@rewind-ui/core";
import Link from "next/link";
import { createBlog } from "@/src/app/lib/actions";

const CreateBlogPage = () => {
  return (
    <>
      <h2 className="text-4xl font-bold">Create New Blog Post</h2>
      <Link
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600"
        href={`/blog`}
      >
        &larr; All Blog Posts
      </Link>
      <form
        className="text-lg mt-2 md:w-full lg:min-w-[600px] lg:w-1/2"
        action={createBlog}
      >
        <Input
          required
          type="text"
          name="title"
          color="purple"
          placeholder="Title"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0"
        />

        <Textarea
          required
          className="h-[500] bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          tone="solid"
          color="purple"
          placeholder="What's On Your Mind?"
          name="content"
        />

        <Button variant="primary" type="submit" className="mt-1">
          Send Message
        </Button>
      </form>
    </>
  );
};

export default CreateBlogPage;
