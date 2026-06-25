const jobs = new Map();

function registerJob(job = {}) {
  const normalized = {
    id: String(job.id || "").trim(),
    name: String(job.name || "").trim(),
    schedule: String(job.schedule || "manual").trim(),
    enabled: job.enabled !== false,
    handler: typeof job.handler === "function" ? job.handler : async () => ({ ok: true, simulated: true })
  };

  if (!normalized.id || !normalized.name) {
    throw new Error("scheduler.registerJob requer id e name.");
  }

  jobs.set(normalized.id, normalized);
  return { ...normalized, handler: undefined };
}

function listJobs() {
  return [...jobs.values()].map((job) => ({
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled
  }));
}

async function runJob(jobId) {
  const job = jobs.get(String(jobId || "").trim());
  if (!job) {
    return { ok: false, status: "not_found", jobId };
  }

  if (!job.enabled) {
    return { ok: true, status: "skipped", reason: "disabled", jobId: job.id };
  }

  try {
    const output = await Promise.resolve(job.handler());
    return {
      ok: true,
      status: "executed",
      simulated: true,
      jobId: job.id,
      output
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      jobId: job.id,
      error: error?.message || "Erro ao executar job"
    };
  }
}

module.exports = {
  registerJob,
  listJobs,
  runJob
};
