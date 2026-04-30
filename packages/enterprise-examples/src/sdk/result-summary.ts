import type { AgentArtifact, AgentRunResult } from '../types';

export function summarizeRunResult(result: AgentRunResult): string {
  const lines = [
    `Run ${result.id}: ${result.status}`,
    result.durationMs === undefined ? undefined : `Duration: ${result.durationMs}ms`,
    result.result,
    summarizeGit(result),
    summarizeArtifacts(result.artifacts),
  ].filter((line): line is string => line !== undefined && line.length > 0);

  return lines.join('\n');
}

function summarizeGit(result: AgentRunResult): string | undefined {
  if (result.git === undefined || result.git.branches.length === 0) {
    return undefined;
  }

  const branches = result.git.branches.map((branch) => {
    const branchName = branch.branch ?? 'branch unavailable';
    const pr = branch.prUrl === undefined ? '' : ` (${branch.prUrl})`;
    return `${branch.repoUrl} -> ${branchName}${pr}`;
  });

  return `Git: ${branches.join(', ')}`;
}

function summarizeArtifacts(artifacts: AgentArtifact[]): string | undefined {
  if (artifacts.length === 0) {
    return undefined;
  }

  return `Artifacts: ${artifacts.map((artifact) => artifact.path).join(', ')}`;
}
