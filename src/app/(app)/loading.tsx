import { SkeletonPage } from "@/components/ui/Skeleton";

// Fallback loading UI for every app route that doesn't define its own.
export default function Loading() {
  return <SkeletonPage />;
}
