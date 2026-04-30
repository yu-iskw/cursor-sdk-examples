import { buildTaskPrompt } from '../prompts';

import type {
  AgentArtifact,
  AgentRunResult,
  EnterpriseTaskConfig,
  RepositoryTarget,
  StreamReporter,
} from '../types';

export { summarizeRunResult } from './result-summary';

export interface RunEnterpriseTaskDeps {
  Agent?: AgentFactory;
}

interface RawRunResult {
  id: string;
  status: AgentRunResult['status'];
  result?: string;
  durationMs?: number;
  git?: AgentRunResult['git'];
}

interface AgentLike {
  send(message: string): Promise<RunLike>;
  listArtifacts(): Promise<AgentArtifact[]>;
  close(): void;
  [Symbol.asyncDispose]?: () => Promise<void>;
}

interface AgentFactory {
  create(options: Record<string, unknown>): Promise<AgentLike>;
}

interface RunLike {
  stream(): AsyncGenerator<unknown, void>;
  wait(): Promise<RawRunResult>;
}

interface CursorSdkModule {
  Agent: AgentFactory;
}

export async function runEnterpriseTask(
  config: EnterpriseTaskConfig,
  reporter: StreamReporter = process.stdout,
  deps?: RunEnterpriseTaskDeps,
): Promise<AgentRunResult> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('CURSOR_API_KEY is required to run Cursor SDK examples');
  }

  const Agent = deps?.Agent ?? ((await import('@cursor/sdk')) as CursorSdkModule).Agent;

  if (config.runtime.type === 'cloud' && config.target.repos.length > 1) {
    return runCloudTaskForEachRepo(config, reporter, Agent, apiKey);
  }

  return runSingleEnterpriseTask(config, reporter, Agent, apiKey);
}

function prefixReporter(reporter: StreamReporter, label: string): StreamReporter {
  const prefix = `[${label}] `;
  return {
    write(message: string) {
      for (const line of message.split('\n')) {
        if (line.length > 0) {
          reporter.write(`${prefix}${line}\n`);
        }
      }
    },
  };
}

async function runCloudTaskForEachRepo(
  config: EnterpriseTaskConfig,
  reporter: StreamReporter,
  Agent: AgentFactory,
  apiKey: string,
): Promise<AgentRunResult> {
  const settled = await Promise.allSettled(
    config.target.repos.map((repo) =>
      runSingleEnterpriseTask(
        { ...config, target: { repos: [repo] } },
        prefixReporter(reporter, repo.repoUrl),
        Agent,
        apiKey,
      ),
    ),
  );

  return aggregateRepoResults(settled, config.target.repos);
}

function aggregateRepoResults(
  settled: PromiseSettledResult<AgentRunResult>[],
  repos: RepositoryTarget[],
): AgentRunResult {
  const fulfilled = settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
  const rejected = repos.flatMap((repo, index) => {
    const entry = settled.at(index);
    return entry?.status === 'rejected' ? [{ repoUrl: repo.repoUrl, reason: entry.reason }] : [];
  });

  const anyError = rejected.length > 0 || fulfilled.some((result) => result.status === 'error');
  const anyCancelled = fulfilled.some((result) => result.status === 'cancelled');

  let status: AgentRunResult['status'];
  if (anyError) {
    status = 'error';
  } else if (anyCancelled) {
    status = 'cancelled';
  } else {
    status = 'finished';
  }

  return {
    id: fulfilled.map((result) => result.id).join(',') || 'multi-repo-run',
    status,
    result: formatMultiRepoResult(fulfilled, rejected),
    durationMs: maxDurationMs(fulfilled),
    git: { branches: fulfilled.flatMap((result) => result.git?.branches ?? []) },
    artifacts: fulfilled.flatMap((result) => result.artifacts),
  };
}

function formatMultiRepoResult(
  fulfilled: AgentRunResult[],
  rejected: { repoUrl: string; reason: unknown }[],
): string {
  const sections: string[] = [];

  for (const result of fulfilled) {
    const header = result.result === undefined ? '(no message)' : result.result;
    sections.push(`[${result.status}] ${result.id}\n${header}`);
  }

  for (const { repoUrl, reason } of rejected) {
    sections.push(`[failed] ${repoUrl}\n${formatRejectionReason(reason)}`);
  }

  return sections.join('\n\n---\n\n');
}

function formatRejectionReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

function maxDurationMs(fulfilled: AgentRunResult[]): number | undefined {
  const values = fulfilled
    .map((result) => result.durationMs)
    .filter((ms): ms is number => typeof ms === 'number');
  if (values.length === 0) {
    return undefined;
  }

  return Math.max(...values);
}

async function runSingleEnterpriseTask(
  config: EnterpriseTaskConfig,
  reporter: StreamReporter,
  Agent: AgentFactory,
  apiKey: string,
): Promise<AgentRunResult> {
  const agent = await Agent.create(buildAgentOptions(config, apiKey));
  try {
    const run = await agent.send(buildTaskPrompt(config));
    for await (const event of run.stream()) {
      const message = formatStreamEvent(event);
      if (message.length > 0) {
        reporter.write(`${message}\n`);
      }
    }

    const result = await run.wait();
    const artifacts = await safeListArtifacts(agent);
    return { ...result, artifacts };
  } finally {
    await disposeAgent(agent);
  }
}

function buildAgentOptions(config: EnterpriseTaskConfig, apiKey: string): Record<string, unknown> {
  const base = {
    apiKey,
    model: config.model,
    name: `Enterprise example: ${config.task}`,
  };

  if (config.runtime.type === 'local') {
    return {
      ...base,
      local: {
        cwd: config.runtime.cwd,
        settingSources: config.runtime.settingSources,
      },
    };
  }

  return {
    ...base,
    cloud: {
      env: config.runtime.env,
      repos: config.target.repos.map((r) => ({ url: r.repoUrl, startingRef: r.startingRef })),
      autoCreatePR: config.autoCreatePR,
    },
  };
}

function formatStreamEvent(event: unknown): string {
  if (!isRecord(event) || typeof event.type !== 'string') {
    return '';
  }

  switch (event.type) {
    case 'assistant':
      return formatAssistantEvent(event);
    case 'thinking':
      return typeof event.text === 'string' ? event.text : '';
    case 'status':
      return typeof event.status === 'string' ? `[status] ${event.status}` : '';
    case 'task':
      return typeof event.text === 'string' ? `[task] ${event.text}` : '';
    case 'tool_call':
      return formatToolCallEvent(event);
    default:
      return '';
  }
}

function formatAssistantEvent(event: Record<string, unknown>): string {
  if (!isRecord(event.message) || !Array.isArray(event.message.content)) {
    return '';
  }

  return event.message.content
    .flatMap((block) => {
      if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') {
        return [];
      }

      return [block.text];
    })
    .join('');
}

function formatToolCallEvent(event: Record<string, unknown>): string {
  const name = typeof event.name === 'string' ? event.name : 'tool';
  const status = typeof event.status === 'string' ? event.status : 'unknown';
  return `[tool] ${name}: ${status}`;
}

async function safeListArtifacts(agent: AgentLike): Promise<AgentArtifact[]> {
  try {
    return await agent.listArtifacts();
  } catch {
    return [];
  }
}

async function disposeAgent(agent: AgentLike): Promise<void> {
  const asyncDispose = agent[Symbol.asyncDispose];
  if (asyncDispose !== undefined) {
    await asyncDispose.call(agent);
    return;
  }

  agent.close();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
