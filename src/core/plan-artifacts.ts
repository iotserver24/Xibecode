import * as fs from 'fs/promises';
import * as path from 'path';

export interface PersistedPlanArtifact {
  artifactPath: string;
  compatibilityPath: string;
}

export async function persistPlanArtifact(
  workingDir: string,
  sessionId: string,
  request: string,
  planContent: string,
): Promise<PersistedPlanArtifact> {
  const plansDir = path.join(workingDir, '.xibecode', 'plans');
  await fs.mkdir(plansDir, { recursive: true });

  const artifactPath = path.join(plansDir, `${sessionId}.md`);
  const compatibilityPath = path.join(workingDir, 'implementations.md');
  const rendered = renderPlanArtifact(sessionId, request, planContent);

  await fs.writeFile(artifactPath, rendered, 'utf8');
  await fs.writeFile(compatibilityPath, rendered, 'utf8');

  return { artifactPath, compatibilityPath };
}

export async function loadLatestPlanArtifact(workingDir: string): Promise<{ path: string; content: string } | null> {
  const plansDir = path.join(workingDir, '.xibecode', 'plans');
  let files: string[];
  try {
    files = await fs.readdir(plansDir);
  } catch {
    return null;
  }

  const markdownFiles = files.filter((file) => file.endsWith('.md'));
  if (markdownFiles.length === 0) return null;

  const withStats: { fullPath: string; mtimeMs: number }[] = [];
  const CONCURRENCY_LIMIT = 50;
  for (let i = 0; i < markdownFiles.length; i += CONCURRENCY_LIMIT) {
    const chunk = markdownFiles.slice(i, i + CONCURRENCY_LIMIT);
    const chunkStats = await Promise.all(
      chunk.map(async (file) => {
        const fullPath = path.join(plansDir, file);
        const stat = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stat.mtimeMs };
      })
    );
    withStats.push(...chunkStats);
  }

  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latestPath = withStats[0]!.fullPath;
  const content = await fs.readFile(latestPath, 'utf8');
  return { path: latestPath, content };
}

function renderPlanArtifact(sessionId: string, request: string, planContent: string): string {
  const now = new Date().toISOString();
  return [
    `# Implementation Plan`,
    ``,
    `- Session: ${sessionId}`,
    `- Generated: ${now}`,
    ``,
    `## Request`,
    ``,
    request.trim(),
    ``,
    `## Plan`,
    ``,
    planContent.trim(),
    ``,
  ].join('\n');
}
