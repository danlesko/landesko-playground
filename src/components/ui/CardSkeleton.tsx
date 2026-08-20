// Deliberately not built on Card: this one's drop shadow is a step lighter, and
// its height is an exact value where Card's is only a floor. That height gap is
// the real source of the loading-to-loaded jump, and closing it belongs to #10.
// See Card for why utility names are described rather than written out.
export default function CardSkeleton() {
  return (
    <div className="mt-4 p-4 border border-border shadow-sm rounded-lg md:w-full lg:min-w-[600px] lg:w-1/2 h-32 animate-pulse">
      <div className="h-6 bg-gray-300 rounded w-3/4 mb-4"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
      <div className="h-4 bg-gray-300 rounded w-full mb-2"></div>
    </div>
  );
}
