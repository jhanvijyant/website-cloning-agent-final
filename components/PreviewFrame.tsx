"use client";

import { useState } from "react";

type Mode = "desktop" | "tablet" | "mobile";

const WIDTHS: Record<Mode, string> = {
  desktop: "w-full",
  tablet: "w-[768px] max-w-full",
  mobile: "w-[375px] max-w-full",
};

export function PreviewFrame({ previewUrl }: { previewUrl: string | null }) {
  const [mode, setMode] = useState<Mode>("desktop");

  if (!previewUrl) {
    return (
      <div className="flex h-96 items-center justify-center rounded border border-dashed border-neutral-300 text-sm text-neutral-500">
        No preview yet. Generate a frontend to see it here.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
          className="text-xs text-accent underline"
        >
          Open in new tab
        </button>
        <div className="flex gap-1">
          {(["desktop", "tablet", "mobile"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded border px-2 py-1 text-xs capitalize ${mode === m
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 hover:bg-neutral-100"
                }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div
        className={`mx-auto overflow-hidden rounded border border-neutral-300 transition-all ${WIDTHS[mode]}`}
      >
        <iframe
          src={previewUrl}
          className="h-[600px] w-full"
          title="Generated site preview"
        />
      </div>
    </div>
  );
}