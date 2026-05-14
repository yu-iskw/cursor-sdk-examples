import { buildTaskPrompt } from '../prompts';

import type { AgentArtifact, AgentRunResult, EnterpriseTaskConfig, StreamReporter } from '../types';

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

  return runSingleEnterpriseTask(config, reporter, Agent, apiKey);
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

  const cloud: Record<string, unknown> = {
    env: config.runtime.env,
    repos: config.target.repos.map((r) => ({ url: r.repoUrl, startingRef: r.startingRef })),
    autoCreatePR: config.autoCreatePR,
  };

  const envVars = buildCloudEnvVarsFromProcess(config.cloudEnvVarNames);
  if (envVars !== undefined) {
    cloud.envVars = envVars;
  }

  return {
    ...base,
    cloud,
  };
}

function buildCloudEnvVarsFromProcess(
  names: string[] | undefined,
): Record<string, string> | undefined {
  if (names === undefined || names.length === 0) {
    return undefined;
  }

  const out: Record<string, string> = {};
  for (const key of names) {
    // Keys are allowlisted in parseOptionalCloudEnvVarNames (no CURSOR_, safe charset).
    // eslint-disable-next-line security/detect-object-injection -- dynamic env lookup for explicit name list
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      // eslint-disable-next-line security/detect-object-injection -- key from same allowlist
      out[key] = value;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
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
