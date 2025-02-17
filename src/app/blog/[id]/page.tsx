import { getBlog } from "@/src/app/lib/data";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id } = params;
  const blog = await getBlog(id);
  const title = `${blog.title}`;
  const description = "One of many blog posts.";

  return {
    title,
    description,
  };
}

export default async function Blog(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const blog = await getBlog(id);
  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <h2 className="text-4xl font-bold">{blog.title}</h2>
      <a
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600"
        href={`/blog`}
      >
        &larr; All Blog Posts
      </a>
      <div
        key={blog.title}
        className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-white overflow-auto"
      >
        <div className="flow-root">
          <h4 className="text-md font-bold">
            {new Date(blog.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h4>
        </div>
        <p className="clear-both">{blog.content}</p>
      </div>
    </div>
  );
}
