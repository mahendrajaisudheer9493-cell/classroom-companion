import { FilePreview } from "@/app/app/_components/file-preview";
import { Section } from "@/app/app/_components/ui";
import type { FeedbackDto, SubmissionDto } from "@/app/app/_lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Submission history, latest first, with previews. Shared by review (teacher) and my work (student). */
export function SubmissionList({ submissions, title = "Submissions" }: { submissions: SubmissionDto[]; title?: string }) {
  if (submissions.length === 0) return null;
  return (
    <Section title={`${title} (${submissions.length})`}>
      {submissions.map((s, i) => (
        <div key={s.id} className="space-y-2 border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
          <p className="text-xs text-tg-hint">
            {i === 0 ? "Latest · " : ""}
            {when(s.at)}
          </p>
          {s.kind === "IN_CLASS" && <p className="font-medium">📒 Bringing it to class</p>}
          {(s.kind === "PHOTO" || s.kind === "FILE") && <FilePreview submissionId={s.id} mimeType={s.mimeType} fileName={s.fileName} />}
          {s.text && <p className="whitespace-pre-wrap">{s.text}</p>}
        </div>
      ))}
    </Section>
  );
}

export function FeedbackList({ feedback }: { feedback: FeedbackDto[] }) {
  if (feedback.length === 0) return null;
  return (
    <Section title="Feedback">
      {feedback.map((f) => (
        <div key={f.id} className="border-b border-tg-hint/15 px-4 py-3 last:border-b-0">
          <p className={`text-sm font-medium ${f.result === "COMPLETED" ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400"}`}>
            {f.result === "COMPLETED" ? "✓ Completed" : "↺ Needs revision"}
          </p>
          {f.comment && <p className="whitespace-pre-wrap">{f.comment}</p>}
          <p className="text-xs text-tg-hint">
            {f.teacher} · {when(f.at)}
          </p>
        </div>
      ))}
    </Section>
  );
}
