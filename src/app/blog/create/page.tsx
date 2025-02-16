import { Input, Textarea, Button } from "@rewind-ui/core";

const CreateBlogPage = () => {
  return (
    <>
      <h2 className="text-4xl font-bold">Create New Blog Post</h2>
      <form className="text-lg mt-2 md:w-full lg:min-w-[600px] lg:w-1/2 h-full">
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
          className="lg:h-1/2 md:h-[500px] bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
          tone="solid"
          color="purple"
          placeholder="What's On Your Mind?"
          name="message"
        />

        <Button variant="primary" type="submit" className="mt-1">
          Send Message
        </Button>
      </form>
    </>
  );
};

export default CreateBlogPage;
