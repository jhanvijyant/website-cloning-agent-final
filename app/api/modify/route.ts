import { NextRequest, NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/jobStore";
import { writeProjectFiles, readProjectFiles } from "@/lib/fileWriter";
import { modifyProject, ModificationError } from "@/agent/modifier";
import { repairFile } from "@/agent/generator";
import { runTypeCheck, extractFailingFile } from "@/agent/validator";
import type { GeneratedFile } from "@/agent/types";

const MAX_REPAIR_ATTEMPTS = 2;

export async function POST(req: NextRequest) {
  const { jobId, instruction } = (await req.json()) as {
    jobId?: string;
    instruction?: string;
  };

  const job = jobId ? getJob(jobId) : undefined;
  if (!job || (job.status !== "ready" && job.status !== "error")) {
    return NextResponse.json(
      { error: "Job is not in a state that can be modified yet." },
      { status: 404 }
    );
  }
  if (!instruction?.trim()) {
    return NextResponse.json({ error: "An instruction is required." }, { status: 400 });
  }

  try {
    updateJob(job.id, { status: "modifying", statusMessage: "Applying modification..." });

    // Normalize Windows backslashes so the app/ and components/ filter works.
    const onDisk: GeneratedFile[] = readProjectFiles(job.slug).map((f) => ({
      ...f,
      path: f.path.replace(/\\/g, "/"),
    }));
    const editable = onDisk.filter(
      (f) => f.path.startsWith("app/") || f.path.startsWith("components/")
    );

    if (editable.length === 0) {
      updateJob(job.id, { status: "ready", statusMessage: "No editable files found." });
      return NextResponse.json(
        { error: "No editable files found in the generated project." },
        { status: 500 }
      );
    }

    const { changedFiles, explanation } = await modifyProject(editable, instruction);

    if (changedFiles.length === 0) {
      updateJob(job.id, { status: "ready", statusMessage: "No change applied." });
      return NextResponse.json({ jobId: job.id, explanation, changedFiles: [] });
    }

    let files: GeneratedFile[] = onDisk.map((f) => {
      const change = changedFiles.find((c) => c.path === f.path);
      return change ? { ...f, content: change.content } : f;
    });
    for (const change of changedFiles) {
      if (!files.some((f) => f.path === change.path)) files.push(change);
    }

    writeProjectFiles(job.slug, files);

    let result = await runTypeCheck(job.slug);
    let attempt = 0;
    while (!result.success && attempt < MAX_REPAIR_ATTEMPTS) {
      attempt++;
      const knownPaths = files.map((f) => f.path);
      const failingPath = extractFailingFile(result.errorOutput || "", knownPaths);
      if (!failingPath) break;
      const failingFile = files.find((f) => f.path === failingPath);
      if (!failingFile) break;

      const fixed = await repairFile(failingPath, failingFile.content, result.errorOutput || "");
      files = files.map((f) => (f.path === failingPath ? { ...f, content: fixed } : f));
      writeProjectFiles(job.slug, files);
      result = await runTypeCheck(job.slug);
    }

    if (!result.success) {
      updateJob(job.id, {
        status: "error",
        statusMessage: "Modification introduced a build error that could not be auto-fixed.",
      });
      return NextResponse.json(
        {
          error: "That modification produced a build error automatic repair couldn't resolve.",
          details: result.errorOutput,
        },
        { status: 422 }
      );
    }

    updateJob(job.id, {
      status: "ready",
      statusMessage: "Modification applied.",
      generatedFiles: files,
    });

    return NextResponse.json({
      jobId: job.id,
      explanation,
      changedFiles: changedFiles.map((f) => f.path),
    });
  } catch (err) {
    console.error("Unexpected modify error:", err);
    const message =
      err instanceof ModificationError ? err.message : "Something went wrong applying that change.";
    updateJob(job.id, { status: "error", statusMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}