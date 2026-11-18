import { FilePreview } from "@/app/app/_components/file-preview";
import { Camera, FileText, NotebookPen, Type, type LucideIcon } from "lucide-react";
import { Chip, List, StatusChip } from "@/components/ui";
import type { FeedbackDto, SubmissionDto } from "@/app/app/_lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const KIND: Record<SubmissionDto["kind"], { label: string; icon: LucideIcon }> = {
  PHOTO: { label: "Photo", icon: Camera },
  FILE: { label: "File", icon: FileText },
  TEXT: { label: "Typed answer", icon: Type },
  IN_CLASS: { label: "Bringing it to class", icon: NotebookPen },
};

/** Submission history, latest first, with previews. Shared by review (teacher) and my work (student). */
export function SubmissionList({ submissions, title = "Submissions" }: { submissions: SubmissionDto[]; title?: string }) {
  if (submissions.length === 0) return null;
  return (
    <List title={`${title} · ${submissions.length}`}>
      {submissions.map((s, i) => {
        const k = KIND[s.kind];
        const Icon = k.icon;
        return (
          <div key={s.id} className="list-row">
            <div className="list-row-body space-y-2 px-4 py-3">
              <p className="flex items-center gap-1.5 text-caption text-tg-hint">
                <Icon aria-hidden size={14} />
                <span className="font-medium text-tg-text">{k.label}</span>
                <span>· {when(s.at)}</span>
                {i === 0 && submissions.length > 1 && (
                  <Chip tone="accent" size="sm">
                    Latest
                  </Chip>
                )}
              </p>
              {(s.kind === "PHOTO" || s.kind === "FILE") && <FilePreview submissionId={s.id} mimeType={s.mimeType} fileName={s.fileName} />}
              {s.text && <p className="whitespace-pre-wrap rounded-xl bg-field px-3 py-2 text-body">{s.text}</p>}
            </div>
          </div>
        );
      })}
    </List>
  );
}

export function FeedbackList({ feedback }: { feedback: FeedbackDto[] }) {
  if (feedback.length === 0) return null;
  return (
    <List title="Feedback">
      {feedback.map((f) => (
        <div key={f.id} className="list-row">
          <div className="list-row-body space-y-1 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <StatusChip status={f.result} size="sm" />
              <span className="text-caption text-tg-hint">
                {f.teacher} · {when(f.at)}
              </span>
            </div>
            {f.comment && <p className="whitespace-pre-wrap text-body">{f.comment}</p>}
          </div>
        </div>
      ))}
    </List>
  );
}
