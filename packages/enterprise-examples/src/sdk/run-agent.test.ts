import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseTaskConfig } from '../config';

import { runEnterpriseTask, summarizeRunResult } from './run-agent';

import type { AgentRunResult, EnterpriseTaskConfig } from '../types';

const devNull: { write(message: string): void } = {
  write() {},
};

describe('summarizeRunResult', () => {
  it('keeps PR and branch evidence visible in summaries', () => {
    const result: AgentRunResult = {
      id: 'run-123',
      status: 'finished',
      result: 'Updated workflow and opened a PR.',
      durationMs: 1250,
      git: {
        branches: [
          {
            repoUrl: 'https://github.com/acme/service-a',
            branch: 'cursor/ci-standardization',
            prUrl: 'https://github.com/acme/service-a/pull/42',
          },
        ],
      },
      artifacts: [{ path: 'summary.md', sizeBytes: 512, updatedAt: '2026-04-30T00:00:00.000Z' }],
    };

    const summary = summarizeRunResult(result);
    expect(summary).toContain(
      'https://github.com/acme/service-a -> cursor/ci-standardization (https://github.com/acme/service-a/pull/42)',
    );
    expect(summary).toContain('Artifacts: summary.md');
  });
});

describe('runEnterpriseTask multi-repo cloud unified agent', () => {
  beforeEach(() => {
    process.env.CURSOR_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.CURSOR_API_KEY;
  });

  function cloudTwoRepoConfig(): EnterpriseTaskConfig {
    return parseTaskConfig({
      task: 'dependency-remediation',
      runtime: { type: 'cloud' },
      target: {
        repos: [
          { repoUrl: 'https://github.com/acme/a', startingRef: 'main' },
          { repoUrl: 'https://github.com/acme/b', startingRef: 'develop' },
        ],
      },
      policy: 'Fix deps.',
    });
  }

  type WaitPayload = Pick<AgentRunResult, 'id' | 'status' | 'result' | 'durationMs' | 'git'>;

  type FakeAgentStep = { createError: Error } | { wait: WaitPayload };
  type CreateOptions = {
    cloud?: {
      repos: Array<{ url: string; startingRef?: string }>;
      envVars?: Record<string, string>;
    };
  };

  function makeFakeAgent(
    recordedCreates: CreateOptions[],
    sequence: FakeAgentStep[],
  ): {
    create(options: Record<string, unknown>): Promise<ReturnType<typeof makeFakeAgentInstance>>;
  } {
    const queue = [...sequence];
    return {
      async create(options: Record<string, unknown>) {
        recordedCreates.push(options as CreateOptions);
        const step = queue.shift();
        if (step === undefined) {
          throw new Error('fake Agent: no sequence step');
        }

        if ('createError' in step) {
          throw step.createError;
        }

        const payload = step.wait;
        return makeFakeAgentInstance(payload);
      },
    };
  }

  function makeFakeAgentInstance(payload: WaitPayload) {
    return {
      async send(_message: string) {
        return {
          async *stream(): AsyncGenerator<unknown, void> {},
          async wait() {
            return { ...payload };
          },
        };
      },
      listArtifacts: async () => [],
      close() {},
    };
  }

  it('calls Agent.create once with both repos in cloud.repos', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      {
        wait: {
          id: 'run-unified',
          status: 'finished',
          result: 'Done A and B',
          durationMs: 150,
          git: {
            branches: [
              {
                repoUrl: 'https://github.com/acme/a',
                prUrl: 'https://github.com/acme/a/pull/1',
              },
              {
                repoUrl: 'https://github.com/acme/b',
                prUrl: 'https://github.com/acme/b/pull/2',
              },
            ],
          },
        },
      },
    ]);

    const result = await runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent });

    expect(creates).toHaveLength(1);
    const cloud = creates[0]?.cloud;
    expect(cloud?.repos).toHaveLength(2);
    expect(cloud?.repos[0]).toEqual({ url: 'https://github.com/acme/a', startingRef: 'main' });
    expect(cloud?.repos[1]).toEqual({ url: 'https://github.com/acme/b', startingRef: 'develop' });

    expect(result.status).toBe('finished');
    expect(result.id).toBe('run-unified');
    expect(result.durationMs).toBe(150);
    expect(result.git?.branches).toHaveLength(2);
    expect(result.git?.branches.map((b) => b.prUrl)).toEqual([
      'https://github.com/acme/a/pull/1',
      'https://github.com/acme/b/pull/2',
    ]);
    expect(summarizeRunResult(result)).toContain('https://github.com/acme/a/pull/1');
    expect(summarizeRunResult(result)).toContain('https://github.com/acme/b/pull/2');
  });

  it('propagates Agent.create failure', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      { createError: new Error('Cloud agent failed to start') },
    ]);

    await expect(
      runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent }),
    ).rejects.toThrow('Cloud agent failed to start');
    expect(creates).toHaveLength(1);
  });

  it('returns error status from the single cloud run', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      {
        wait: {
          id: 'run-unified',
          status: 'error',
          result: 'Remediation failed',
          git: {
            branches: [
              {
                repoUrl: 'https://github.com/acme/a',
                prUrl: 'https://github.com/acme/a/pull/1',
              },
            ],
          },
        },
      },
    ]);

    const result = await runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent });

    expect(creates).toHaveLength(1);
    expect(result.status).toBe('error');
    expect(result.id).toBe('run-unified');
    expect(result.git?.branches).toHaveLength(1);
    expect(result.git?.branches[0]?.prUrl).toBe('https://github.com/acme/a/pull/1');
    expect(result.result).toContain('Remediation failed');
    expect(summarizeRunResult(result)).toContain('https://github.com/acme/a/pull/1');
  });

  it('passes cloud.envVars when cloudEnvVarNames is set and process env is present', async () => {
    const creates: CreateOptions[] = [];
    process.env.EXAMPLE_REGISTRY_TOKEN = 'secret-token';
    try {
      const config = parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'cloud' },
        target: {
          repos: [
            { repoUrl: 'https://github.com/acme/a', startingRef: 'main' },
            { repoUrl: 'https://github.com/acme/b', startingRef: 'develop' },
          ],
        },
        policy: 'Fix deps.',
        cloudEnvVarNames: ['EXAMPLE_REGISTRY_TOKEN'],
      });

      const agent = makeFakeAgent(creates, [
        {
          wait: {
            id: 'run-env',
            status: 'finished',
            result: 'ok',
          },
        },
      ]);

      await runEnterpriseTask(config, devNull, { Agent: agent });

      expect(creates[0]?.cloud?.envVars).toEqual({ EXAMPLE_REGISTRY_TOKEN: 'secret-token' });
    } finally {
      delete process.env.EXAMPLE_REGISTRY_TOKEN;
    }
  });
});
