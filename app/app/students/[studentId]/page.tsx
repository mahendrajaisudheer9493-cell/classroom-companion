import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { StudentWork } from "@/app/app/students/[studentId]/student-work";

export default function StudentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StudentWork />
    </Suspense>
  );
}
