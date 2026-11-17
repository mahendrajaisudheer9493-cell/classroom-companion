import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { NewAssignmentForm } from "@/app/app/assignments/new/new-assignment-form";

// ?draft=<id> is only known at request time → client form inside Suspense (cacheComponents).
export default function NewAssignmentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewAssignmentForm />
    </Suspense>
  );
}
