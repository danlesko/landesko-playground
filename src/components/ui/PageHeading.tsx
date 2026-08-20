export default function PageHeading({
  children,
}: {
  children: React.ReactNode;
}) {
  return <h2 className="text-4xl font-bold">{children}</h2>;
}
