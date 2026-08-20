// The full-post container, shared by the blog detail page and its error boundary.
// MyBlogBodyAbbr's list card deliberately does NOT use this: it swaps lg:w-1/2 for
// lg:max-w-[50%] and adds max-h-32, so routing it through here would change its
// emitted classes. Unifying the three is #10's job, since it is a visual change.
export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto">
      {children}
    </div>
  );
}
