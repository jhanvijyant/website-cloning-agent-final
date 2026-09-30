import { execFile } from "child_process";
import path from "path";
import type { ValidationResult } from "./types";
import { projectDir } from "@/lib/fileWriter";

// Runs a JS entry file with the current Node binary instead of executing
// node_modules/.bin/* directly. The .bin shims are shell scripts / .cmd
// files on Windows, which execFile cannot launch without a shell.
function runNodeScript(
  cwd: string,
  scriptParts: string[],
  args: string[],
  timeout: number
): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const script = path.join(cwd, "node_modules", ...scriptParts);

    execFile(
      process.execPath,
      [script, ...args],
      { cwd, timeout, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ success: true, errorOutput: null });
          return;
        }
        // Include error.message so launch failures are never silent again.
        const output = `${stdout}\n${stderr}\n${error.message}`.trim();
        resolve({ success: false, errorOutput: output.slice(0, 4000) });
      }
    );
  });
}

// `tsc --noEmit` is used for the retry loop: it catches the errors
// AI-generated code actually produces in a couple of seconds.
export function runTypeCheck(slug: string): Promise<ValidationResult> {
  return runNodeScript(
    projectDir(slug),
    ["typescript", "bin", "tsc"],
    ["--noEmit"],
    30_000
  );
}

export function runFullBuild(slug: string): Promise<ValidationResult> {
  return runNodeScript(
    projectDir(slug),
    ["next", "dist", "bin", "next"],
    ["build"],
    90_000
  );
}

// Pulls the first "path/to/file.tsx" mentioned in tsc's output so the
// repair call can target just that file instead of guessing.
export function extractFailingFile(errorOutput: string, knownPaths: string[]): string | null {
  for (const p of knownPaths) {
    if (errorOutput.includes(p)) return p;
  }
  return null;
}