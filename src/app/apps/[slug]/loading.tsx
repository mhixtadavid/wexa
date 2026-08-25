import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
      <Skeleton className="mb-6 mt-6 h-28 w-full rounded-xl" />
      <Skeleton className="mb-10 h-16 w-full rounded-lg" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="mb-12">
          <Skeleton className="mb-1 h-5 w-72" />
          <Skeleton className="mb-4 h-4 w-full max-w-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
