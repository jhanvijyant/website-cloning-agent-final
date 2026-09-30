import type { WebsiteAnalysis } from "@/agent/types";

export function AnalysisSummary({ analysis }: { analysis: WebsiteAnalysis }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-medium" style={{ color: "var(--text)" }}>
          {analysis.metadata.title}
        </h3>
        {analysis.metadata.description && (
          <p className="mt-1" style={{ color: "var(--muted)" }}>
            {analysis.metadata.description}
          </p>
        )}
      </div>

      <Row label="Navigation">
        {analysis.navigation.length > 0
          ? analysis.navigation.map((n) => n.label).join(", ")
          : "None found"}
      </Row>

      <Row label="Sections">
        {analysis.sections.length} detected (
        {analysis.sections.map((s) => s.kind).join(", ")})
      </Row>

      <Row label="Colors">
        {analysis.colors.palette.length > 0 ? (
          <span className="inline-flex gap-1 align-middle">
            {analysis.colors.palette.map((c) => (
              <span
                key={c}
                title={c}
                className="inline-block h-4 w-4 rounded"
                style={{ backgroundColor: c, border: "1px solid var(--border)" }}
              />
            ))}
          </span>
        ) : (
          "None detected"
        )}
      </Row>

      <Row label="Typography">
        {analysis.typography.headingFont || "No custom font detected"}
      </Row>

      <Row label="Images">{analysis.assets.images.length} found</Row>

      <Row label="Layout">
        {[
          analysis.layout.hasHeader ? "header" : null,
          analysis.layout.hasFooter ? "footer" : null,
          `~${analysis.layout.approxColumns} column(s)`,
        ]
          .filter(Boolean)
          .join(", ")}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
      <div style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-0.5" style={{ color: "var(--text)" }}>
        {children}
      </div>
    </div>
  );
}