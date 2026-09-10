import type { AgentConfig } from "./config.ts";
import type { PrintDocument } from "./document.ts";

export type ClaimedJob = { id: string; kind: string; document: PrintDocument };

/** The agent's poll: a plain authenticated fetch, no session, no cookie — a Bearer device token is the entire auth story, per this module's rule that the agent never gets database credentials. The server decides the batch size; the agent doesn't ask for one. */
export async function claimJobs(config: AgentConfig): Promise<ClaimedJob[]> {
  const response = await fetch(`${config.serverUrl}/api/agent/print-jobs/claim`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.deviceToken}` },
  });
  if (!response.ok) {
    throw new Error(`claim failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { jobs: ClaimedJob[] };
  return body.jobs;
}

export async function reportComplete(config: AgentConfig, jobId: string): Promise<void> {
  const response = await fetch(`${config.serverUrl}/api/agent/print-jobs/${jobId}/complete`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.deviceToken}` },
  });
  if (!response.ok) {
    throw new Error(`reporting completion failed: HTTP ${response.status}`);
  }
}

export async function reportFailure(config: AgentConfig, jobId: string, message: string): Promise<void> {
  const response = await fetch(`${config.serverUrl}/api/agent/print-jobs/${jobId}/fail`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.deviceToken}`, "content-type": "application/json" },
    body: JSON.stringify({ error: message }),
  });
  if (!response.ok) {
    throw new Error(`reporting failure failed: HTTP ${response.status}`);
  }
}
