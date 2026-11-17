import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { AssignmentDetail } from "@/app/app/assignments/[assignmentId]/assignment-detail";

export default function AssignmentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AssignmentDetail />
    </Suspense>
  );
}
