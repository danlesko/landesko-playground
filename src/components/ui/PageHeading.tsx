const headingClasses = "text-4xl font-bold";

export default function PageHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      // Appended, not merged: the one caller passing anything passes a colour,
      // which does not compete with a size or a weight. A caller needing to
      // replace one of those wants a variant prop, not this.
      className={className ? `${headingClasses} ${className}` : headingClasses}
    >
      {children}
    </h2>
  );
}
