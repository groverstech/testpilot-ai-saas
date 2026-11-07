/**
 * Job queue topology (BullMQ). Each pipeline stage has its own queue so concurrency, retries
 * and resource limits can be tuned per stage, and so browser workers can run on separate,
 * locked-down hosts. Processors for most queues are implemented in later phases.
 */
export const QUEUES = {
  system: "tp-system",
  repoClone: "tp-repo-clone",
  repoAnalysis: "tp-repo-analysis",
  appStartup: "tp-app-startup",
  exploration: "tp-exploration",
  testGeneration: "tp-test-generation",
  testExecution: "tp-test-execution",
  screenshotProcessing: "tp-screenshot-processing",
  visualAnalysis: "tp-visual-analysis",
  bugAnalysis: "tp-bug-analysis",
  reportGeneration: "tp-report-generation",
} as const;

export type QueueKey = keyof typeof QUEUES;

export interface QueuePolicy {
  concurrency: number;
  attempts: number;
  backoffMs: number;
  timeoutMs: number;
  priority?: number;
}

export const QUEUE_POLICIES: Record<QueueKey, QueuePolicy> = {
  system: { concurrency: 4, attempts: 1, backoffMs: 1000, timeoutMs: 10_000 },
  repoClone: { concurrency: 2, attempts: 3, backoffMs: 5000, timeoutMs: 5 * 60_000 },
  repoAnalysis: { concurrency: 2, attempts: 2, backoffMs: 10_000, timeoutMs: 10 * 60_000 },
  appStartup: { concurrency: 2, attempts: 2, backoffMs: 10_000, timeoutMs: 15 * 60_000 },
  exploration: { concurrency: 2, attempts: 2, backoffMs: 10_000, timeoutMs: 20 * 60_000 },
  testGeneration: { concurrency: 2, attempts: 3, backoffMs: 10_000, timeoutMs: 10 * 60_000 },
  testExecution: { concurrency: 2, attempts: 2, backoffMs: 10_000, timeoutMs: 30 * 60_000 },
  screenshotProcessing: { concurrency: 4, attempts: 3, backoffMs: 2000, timeoutMs: 2 * 60_000 },
  visualAnalysis: { concurrency: 2, attempts: 3, backoffMs: 10_000, timeoutMs: 10 * 60_000 },
  bugAnalysis: { concurrency: 2, attempts: 3, backoffMs: 10_000, timeoutMs: 10 * 60_000 },
  reportGeneration: { concurrency: 2, attempts: 3, backoffMs: 5000, timeoutMs: 5 * 60_000 },
};

export interface SystemPingJob {
  requestedAt: string;
}
