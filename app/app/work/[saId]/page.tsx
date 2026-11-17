import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { WorkDetail } from "@/app/app/work/[saId]/work-detail";

export default function WorkPage() {
  return (
    <Suspense fallback={<Loading />}>
      <WorkDetail />
    </Suspense>
  );
}
