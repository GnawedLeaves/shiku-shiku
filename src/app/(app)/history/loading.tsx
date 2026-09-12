import { SkeletonList, SkeletonLine } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <SkeletonLine className="w-40 h-6" />
      <div className="skeleton h-20 w-full rounded-box" />
      <SkeletonList rows={4} lines={1} />
      <span className="sr-only">Loading history</span>
    </div>
  );
}
