/**
 * TestPilot AI background worker.
 *
 * Phase 1 scope: connect to Redis, run the `system` queue (health pings) and expose a health
 * endpoint. The repository, browser and AI pipeline processors are added in Phases 2–5; they
 * will run in separate, sandboxed containers (see docs/architecture/security-model.md) and
 * must never share a host or credentials with the API.
 */
import { createServer } from "node:http";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_POLICIES, QUEUES, type SystemPingJob } from "@testpilot/shared";

const REDIS_URL = process.env.REDIS_URL;
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 4100);

if (!REDIS_URL) {
  console.error("REDIS_URL is required for the worker");
  process.exit(1);
}

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const stats = { startedAt: new Date().toISOString(), processed: 0, failed: 0, lastJobAt: null as string | null };

const systemWorker = new Worker<SystemPingJob>(
  QUEUES.system,
  async (job: Job<SystemPingJob>) => {
    if (job.name === "ping") return { pong: true, latencyMs: Date.now() - Date.parse(job.data.requestedAt) };
    throw new Error(`Unknown system job "${job.name}"`);
  },
  { connection, concurrency: QUEUE_POLICIES.system.concurrency },
);

systemWorker.on("completed", () => {
  stats.processed++;
  stats.lastJobAt = new Date().toISOString();
});
systemWorker.on("failed", (_job, err) => {
  stats.failed++;
  console.error(JSON.stringify({ level: "error", msg: "job failed", queue: QUEUES.system, err: err.message }));
});

const health = createServer(async (req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  let redis = "ok";
  try {
    await connection.ping();
  } catch {
    redis = "error";
  }
  const ok = redis === "ok" && systemWorker.isRunning();
  res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: ok ? "ok" : "degraded", redis, queues: [QUEUES.system], ...stats }));
});

health.listen(HEALTH_PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: "worker started", healthPort: HEALTH_PORT, queues: [QUEUES.system] }));
});

/** Enqueue a ping on start-up so the health endpoint proves an end-to-end queue round trip. */
const systemQueue = new Queue<SystemPingJob>(QUEUES.system, { connection });
void systemQueue.add("ping", { requestedAt: new Date().toISOString() }, { removeOnComplete: 100, removeOnFail: 100 });

async function shutdown(signal: string) {
  console.log(JSON.stringify({ level: "info", msg: "worker shutting down", signal }));
  health.close();
  await systemWorker.close();
  await systemQueue.close();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
