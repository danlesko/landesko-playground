export default function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 p-4 shadow-md rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 min-h-32 border border-border">
      {children}
    </div>
  );
}
