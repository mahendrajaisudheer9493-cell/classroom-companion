"use client";

import { useEffect, useState } from "react";
import { waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * Shows a submitted photo inline, or a download link for other files. The file is fetched with the
 * signed initData header (an <img src> couldn't send it) and shown from a local blob URL.
 */
export function FilePreview({ submissionId, mimeType, fileName }: { submissionId: string; mimeType: string | null; fileName: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    (async () => {
      const webApp = await waitForWebApp();
      const res = await fetch(`/api/files/${submissionId}`, {
        headers: webApp?.initData ? { Authorization: `tma ${webApp.initData}` } : {},
      }).catch(() => null);
      if (!res?.ok) return setError(true);
      objectUrl = URL.createObjectURL(await res.blob());
      setUrl(objectUrl);
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [submissionId]);

  if (error) return <p className="text-sm text-tg-destructive">Couldn&apos;t load the file.</p>;
  if (!url) return <div className="h-40 animate-pulse rounded-lg bg-tg-hint/10" />;
  if (mimeType?.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
    return <img src={url} alt={fileName ?? "Submitted photo"} className="max-h-[70vh] w-full rounded-lg object-contain" />;
  }
  return (
    <a href={url} download={fileName ?? "submission"} className="inline-flex min-h-10 items-center rounded-lg border border-tg-hint/25 px-3.5 text-sm font-medium text-tg-link">
      ⬇ Download {fileName ?? "file"}
    </a>
  );
}
