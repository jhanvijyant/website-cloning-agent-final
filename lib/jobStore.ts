import type { Job } from "@/agent/types";


const globalForJobs = globalThis as unknown as {
  __jobs?: Map<string, Job>;
};

const jobs: Map<string, Job> =
  globalForJobs.__jobs ?? (globalForJobs.__jobs = new Map<string, Job>());

export function createJob(job: Job): void {
  jobs.set(job.id, job);
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const existing = jobs.get(id);
  if (!existing) throw new Error(`Job ${id} not found`);
  const updated = { ...existing, ...patch };
  jobs.set(id, updated);
  return updated;
}