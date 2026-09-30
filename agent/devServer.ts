import { spawn, ChildProcess } from "child_process";
import path from "path";
import { projectDir } from "@/lib/fileWriter";

type RunningServer = {
  process: ChildProcess;
  port: number;
};


const globalState = globalThis as unknown as {
  __previewServers?: Map<string, RunningServer>;
  __previewNextPort?: number;
};
const servers: Map<string, RunningServer> =
  globalState.__previewServers ??
  (globalState.__previewServers = new Map<string, RunningServer>());
if (globalState.__previewNextPort === undefined) {
  globalState.__previewNextPort = 4100;
}

export function isRunning(slug: string): boolean {
  return servers.has(slug);
}

export function getPort(slug: string): number | null {
  return servers.get(slug)?.port ?? null;
}

export function startPreview(slug: string): Promise<number> {
  const existing = servers.get(slug);
  if (existing) return Promise.resolve(existing.port);

  const port = globalState.__previewNextPort as number;
  globalState.__previewNextPort = port + 1;

  const cwd = projectDir(slug);

  const nextScript = path.join(cwd, "node_modules", "next", "dist", "bin", "next");

  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/API_KEY|SECRET|TOKEN/i.test(key))
  ) as NodeJS.ProcessEnv;

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [nextScript, "dev", "-p", String(port)],
      { cwd, env: safeEnv }
    );

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      fail("Preview server did not start within 60 seconds.");
    }, 60_000);

    child.on("error", (err) => {
      fail(`Preview server could not launch: ${err.message}`);
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      console.log(`[preview:${slug}]`, text.trim());
      if (!settled && /ready/i.test(text)) {
        settled = true;
        clearTimeout(timeout);
        servers.set(slug, { process: child, port });
        resolve(port);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[preview:${slug}]`, chunk.toString());
    });

    child.on("exit", () => {
      servers.delete(slug);
      fail("Preview server exited before it was ready.");
    });
  });
}

export function stopPreview(slug: string): void {
  const existing = servers.get(slug);
  if (!existing) return;
  existing.process.kill();
  servers.delete(slug);
}