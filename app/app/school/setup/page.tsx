import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { SchoolSetup } from "@/app/app/school/setup/school-setup";

export default function SchoolSetupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SchoolSetup />
    </Suspense>
  );
}
