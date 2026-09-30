"use client";

import { useRef, useState } from "react";
import type { WebsiteAnalysis } from "@/agent/types";
import { StatusLog, type LogEntry } from "@/components/StatusLog";
import { AnalysisSummary } from "@/components/AnalysisSummary";
import { PreviewFrame } from "@/components/PreviewFrame";

type Phase = "idle" | "analyzing" | "analyzed" | "generating" | "ready" | "error";

export default function Home() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<WebsiteAnalysis | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isModifying, setIsModifying] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function pushLog(message: string) {
    setLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), message }]);
  }

  function pollStatus(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    let lastMessage = "";
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.statusMessage && data.statusMessage !== lastMessage) {
          lastMessage = data.statusMessage;
          pushLog(data.statusMessage);
        }
      } catch {
        // Polling is best-effort UI feedback - a missed tick isn't fatal.
      }
    }, 800);
  }

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  async function handleAnalyze() {
    setError(null);
    setAnalysis(null);
    setPreviewUrl(null);
    setPhase("analyzing");
    pushLog(`Analyzing ${url}...`);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed.");

      setJobId(data.jobId);
      setAnalysis(data.analysis);
      setPhase("analyzed");
      pushLog("Analysis complete.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setPhase("error");
    }
  }

  async function handleGenerate() {
    if (!jobId) return;
    setError(null);
    setPhase("generating");
    pollStatus(jobId);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      stopPolling();
      if (!res.ok) throw new Error(data.error || "Generation failed.");

      setPreviewUrl(data.previewUrl);
      setFiles(data.files || []);
      setPhase("ready");
      pushLog("Ready for preview.");
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Generation failed.");
      setPhase("error");
    }
  }

  async function handleModify() {
    if (!jobId || !instruction.trim() || isModifying) return;
    setError(null);
    setIsModifying(true);
    pollStatus(jobId);
    pushLog(`Applying: "${instruction}"`);

    try {
      const res = await fetch("/api/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, instruction }),
      });
      const data = await res.json();
      stopPolling();
      if (!res.ok) throw new Error(data.error || "Modification failed.");

      pushLog(data.explanation || "Modification applied.");
      setInstruction("");
      setPreviewKey((k) => k + 1);
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "Modification failed.");
    } finally {
      setIsModifying(false);
    }
  }

  const hasAnalysis = !!analysis;
  const hasPreview = !!previewUrl;
  const stageError = phase === "error";

  const stages = [
    {
      label: "Analyze",
      done: hasAnalysis,
      active: phase === "analyzing",
      error: stageError && !hasAnalysis,
    },
    {
      label: "Generate & Validate",
      done: hasPreview,
      active: phase === "generating",
      error: stageError && hasAnalysis && !hasPreview,
    },
    {
      label: "Preview",
      done: hasPreview,
      active: false,
      error: false,
    },
    {
      label: "Modify",
      done: false,
      active: isModifying,
      error: stageError && hasPreview,
    },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          Website Cloning Agent
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Analyze a public website and generate a new React/Next.js frontend for it.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[160px_2fr_1fr]">
        {/* Pipeline rail */}
        <aside className="agent-panel h-fit p-4">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Pipeline
          </h2>
          <div className="stage-list">
            {stages.map((s) => (
              <div
                key={s.label}
                className={`stage-item ${s.done ? "done" : ""} ${s.active ? "active" : ""} ${s.error ? "error" : ""
                  }`}
              >
                <span className="stage-connector" />
                <span className="stage-dot" />
                <span className="stage-label">{s.label}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main area: input, preview */}
        <section className="space-y-6">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="agent-input flex-1 px-3 py-2 text-sm"
            />
            <button
              onClick={handleAnalyze}
              disabled={!url || phase === "analyzing" || phase === "generating"}
              className="agent-btn-primary px-4 py-2 text-sm"
            >
              Analyze
            </button>
          </div>

          {analysis && (
            <button
              onClick={handleGenerate}
              disabled={phase === "generating"}
              className="agent-btn-secondary px-4 py-2 text-sm"
            >
              {phase === "generating" ? "Generating..." : "Generate frontend"}
            </button>
          )}

          {error && <div className="agent-error px-3 py-2 text-sm">{error}</div>}

          <PreviewFrame key={previewKey} previewUrl={previewUrl} />
        </section>

        {/* Sidebar: analysis, files, modification */}
        <aside className="space-y-6">
          <div className="agent-panel p-4">
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>
              Analysis
            </h2>
            {analysis ? (
              <AnalysisSummary analysis={analysis} />
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No analysis yet.
              </p>
            )}
          </div>

          {files.length > 0 && (
            <div className="agent-panel p-4">
              <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>
                Generated files
              </h2>
              <ul
                className="space-y-0.5 font-mono-agent text-xs"
                style={{ color: "var(--muted)", maxHeight: "160px", overflowY: "auto" }}
              >
                {files.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {phase === "ready" && (
            <div className="agent-panel p-4">
              <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>
                Modify
              </h2>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder='e.g. "Change the primary color to blue"'
                rows={3}
                className="agent-input w-full px-3 py-2 text-sm"
              />
              <button
                onClick={handleModify}
                disabled={!instruction.trim() || isModifying}
                className="agent-btn-primary mt-2 px-4 py-2 text-sm"
              >
                {isModifying ? "Modifying..." : "Modify"}
              </button>
            </div>
          )}

          <div className="agent-panel p-4">
            <h2 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>
              Activity
            </h2>
            <StatusLog entries={log} />
          </div>
        </aside>
      </div>
    </main>
  );
}