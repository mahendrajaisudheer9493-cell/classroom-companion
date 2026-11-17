import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { AssignmentOverview } from "@/app/app/assignments/[assignmentId]/assignment-overview";

export default function AssignmentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AssignmentOverview />
    </Suspense>
  );
}
