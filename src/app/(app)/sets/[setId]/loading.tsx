import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <SkeletonLine className="w-48 h-6" />
      <div className="flex gap-2">
        <div className="skeleton h-8 w-28" />
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-8 w-24" />
      </div>
      <SkeletonCard lines={1} />
      <SkeletonCard lines={2} />
      <SkeletonLine className="w-20 h-5" />
      <SkeletonCard lines={4} />
      <span className="sr-only">Loading set</span>
    </div>
  );
}
