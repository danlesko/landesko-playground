// The full-post wrapper, shared by the blog detail page and its error boundary.
// MyBlogBodyAbbr's list card deliberately does not use this: at the large
// breakpoint it caps its width instead of setting one, and it also caps its
// height, so routing it through here would change the classes it emits.
// Reconciling the two shapes is #10's job, since that is a visual change.
//
// Utility names are described rather than written out below, because the content
// scanner treats a bare one in a comment as a class candidate and emits it.
export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border overflow-auto">
      {children}
    </div>
  );
}
