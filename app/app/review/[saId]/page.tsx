import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { ReviewScreen } from "@/app/app/review/[saId]/review-screen";

export default function ReviewPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReviewScreen />
    </Suspense>
  );
}
