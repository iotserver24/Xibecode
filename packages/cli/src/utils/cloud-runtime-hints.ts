import type { CliRemoteExecutionConfig } from './remote-execution.js';
import { fetchPreviewHost } from './cloud-gateway.js';

export type CloudRuntimeHint = {
  sandboxId?: string;
  previewUrl?: string;
  pullHint?: string;
};

export async function getCloudRuntimeHint(remoteExecution?: CliRemoteExecutionConfig): Promise<CloudRuntimeHint> {
  if (!remoteExecution || remoteExecution.strategy !== 'sandbox_full') return {};
  const sessionId = remoteExecution.sessionId?.trim();
  const sandboxId = remoteExecution.e2bSandboxId?.trim();
  if (!sessionId) return { sandboxId };
  const previewUrl = await fetchPreviewHost(remoteExecution, 3000).catch(() => undefined);
  const pullHint = sessionId ? `xc cloud pull --session ${sessionId}` : undefined;
  return {
    sandboxId: remoteExecution.e2bSandboxId?.trim() || sandboxId,
    previewUrl,
    pullHint,
  };
}
