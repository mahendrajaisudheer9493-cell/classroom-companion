import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { ClassRoster } from "@/app/app/classes/[classId]/class-roster";

// The class id is only known at request time, so the client roster sits inside Suspense
// (required with cacheComponents).
export default function ClassPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ClassRoster />
    </Suspense>
  );
}
