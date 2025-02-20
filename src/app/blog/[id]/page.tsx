import { getBlog } from "@/src/app/lib/data";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

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
      <Link
        className="text-xl text-blue-600 hover:text-blue-800 visited:text-purple-600 font-bold"
        href={`/blog`}
      >
        <ArrowLeft size={24} className="inline-block -translate-y-1" /> All Blog
        Posts
      </Link>
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
        <div className="clear-both" />
        <p className="whitespace-pre-line">{blog.content}</p>
      </div>
    </div>
  );
}
