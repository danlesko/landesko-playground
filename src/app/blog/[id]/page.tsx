import { getBlog } from "@/app/lib/data";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { id } = params;
  console.log(id);
  const blog = await getBlog(params.id);
  const title = `Blog Post: ${blog.title}`;
  const description = "Dynamic description based on the blog post";

  return {
    title,
    description,
  };
}

export default async function Blog() {
  //const blog = await getBlog(params.slug);
  return (
    <div className="inline-block" style={{ width: "100%" }}>
      <h2 className="text-4xl font-bold">Blog Posts</h2>
    </div>
  );
}
