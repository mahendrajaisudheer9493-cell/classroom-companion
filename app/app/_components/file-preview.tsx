"use client";

import { Download, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { haptic, waitForWebApp } from "@/app/app/_lib/telegram";

/**
 * Shows a submitted photo inline, or a download link for other files. The file is fetched with the
 * signed initData header (an <img src> couldn't send it) and shown from a local blob URL.
 */
export function FilePreview({ submissionId, mimeType, fileName }: { submissionId: string; mimeType: string | null; fileName: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [full, setFull] = useState(false);

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

  if (error) return <p className="text-caption text-tg-destructive">Couldn&apos;t load the file.</p>;
  if (!url) return <div className="h-56 animate-pulse rounded-xl bg-[var(--color-separator)]" />;
  if (mimeType?.startsWith("image/")) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            setFull(true);
          }}
          className="relative block w-full overflow-hidden rounded-xl bg-field"
          aria-label="Open the photo full screen"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
          <img src={url} alt={fileName ?? "Submitted photo"} className="max-h-[60vh] w-full object-contain" />
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
            <Maximize2 size={16} aria-hidden />
          </span>
        </button>
        {full && (
          <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex items-center justify-center bg-black" onClick={() => setFull(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
            <img src={url} alt={fileName ?? "Submitted photo"} className="max-h-full max-w-full object-contain" />
            <button type="button" aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white">
              <X size={22} aria-hidden />
            </button>
          </div>
        )}
      </>
    );
  }
  return (
    <a href={url} download={fileName ?? "submission"} className="tinted tone-accent inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3.5 text-caption font-semibold">
      <Download size={16} aria-hidden /> Download {fileName ?? "file"}
    </a>
  );
}
