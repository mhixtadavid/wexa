import { Skeleton } from "@/components/ui";

/** Matches the dashboard's real layout so the page does not jump on load. */
export default function Loading() {
  return (
    <div>
      <div className="mb-10 max-w-3xl">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-5/6" />
      </div>
      <Skeleton className="mb-10 h-24 w-full rounded-xl" />
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
