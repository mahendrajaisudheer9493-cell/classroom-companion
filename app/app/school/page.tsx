import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { SchoolHealth } from "@/app/app/school/school-health";

export default function SchoolPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SchoolHealth />
    </Suspense>
  );
}
