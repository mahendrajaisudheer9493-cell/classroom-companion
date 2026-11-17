import { Suspense } from "react";
import { Loading } from "@/app/app/_components/ui";
import { DoubtThread } from "@/app/app/doubts/[saId]/doubt-thread";

export default function DoubtPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DoubtThread />
    </Suspense>
  );
}
