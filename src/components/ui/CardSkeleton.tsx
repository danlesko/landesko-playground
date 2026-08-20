// Deliberately not built on Card: the skeleton uses shadow-sm and a fixed h-32
// where Card uses shadow-md and min-h-32. That height difference is the real
// source of the loading-to-loaded shift, and reconciling it belongs to #10.
export default function CardSkeleton() {
  return (
    <div className="mt-4 p-4 border border-border shadow-sm rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse">
      <div className="h-6 bg-gray-300 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
    </div>
  );
}
