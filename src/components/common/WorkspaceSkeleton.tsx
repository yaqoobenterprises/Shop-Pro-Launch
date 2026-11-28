import React from "react";
import { Skeleton } from "../ui/skeleton";
export function WorkspaceSkeleton() {
  return <div className="page-content" role="status" aria-label="Loading workspace"><Skeleton className="mb-8 h-8 w-48" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div><Skeleton className="mt-6 h-80 w-full" /><span className="sr-only">Loading workspace</span></div>;
}
