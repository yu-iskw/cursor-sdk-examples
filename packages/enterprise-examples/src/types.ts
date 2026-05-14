export const TASK_TYPES = [
  'dependency-remediation',
  'ci-standardization',
  'repo-metadata-hygiene',
] as const;

export type EnterpriseTaskType = (typeof TASK_TYPES)[number];

export interface ModelSelection {
  id: string;
}

export interface LocalRuntimeConfig {
  type: 'local';
  cwd: string;
  settingSources?: string[];
}

export interface CloudRuntimeConfig {
  type: 'cloud';
  env?: { type: 'cloud' | 'pool' | 'machine'; name?: string };
}

export type RuntimeConfig = LocalRuntimeConfig | CloudRuntimeConfig;

export interface RepositoryTarget {
  repoUrl: string;
  startingRef?: string;
}

/** Non-empty after validation; order preserved for prompts and SDK cloud.repos[]. */
export interface EnterpriseTaskTarget {
  repos: RepositoryTarget[];
}

export interface ValidationConfig {
  commands: string[];
}

export interface EnterpriseTaskConfig {
  task: EnterpriseTaskType;
  runtime: RuntimeConfig;
  target: EnterpriseTaskTarget;
  policy: string;
  validation?: ValidationConfig;
  guardrails: string[];
  model: ModelSelection;
  dryRun: boolean;
  autoCreatePR: boolean;
  /**
   * For cloud runs only: names of `process.env` entries to pass through as SDK `cloud.envVars`.
   * Omit secrets from committed YAML; set values in the shell or CI. Names must not start with `CURSOR_`.
   */
  cloudEnvVarNames?: string[];
}

export interface RunGitInfo {
  branches: Array<{ repoUrl: string; branch?: string; prUrl?: string }>;
}

export interface AgentArtifact {
  path: string;
  sizeBytes: number;
  updatedAt: string;
}

export type AgentRunStatus = 'finished' | 'error' | 'cancelled';

export interface AgentRunResult {
  id: string;
  status: AgentRunStatus;
  result?: string;
  durationMs?: number;
  git?: RunGitInfo;
  artifacts: AgentArtifact[];
}

export interface StreamReporter {
  write(message: string): void;
}
