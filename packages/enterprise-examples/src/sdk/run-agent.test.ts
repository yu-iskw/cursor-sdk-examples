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

describe('runEnterpriseTask multi-repo cloud fan-out', () => {
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
  type CreateOptions = { cloud?: { repos: Array<{ url: string }> } };

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

  it('calls Agent.create twice with one cloud repo each', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      {
        wait: {
          id: 'run-a',
          status: 'finished',
          result: 'Done A',
          durationMs: 100,
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
      {
        wait: {
          id: 'run-b',
          status: 'finished',
          result: 'Done B',
          durationMs: 200,
          git: {
            branches: [
              {
                repoUrl: 'https://github.com/acme/b',
                prUrl: 'https://github.com/acme/b/pull/2',
              },
            ],
          },
        },
      },
    ]);

    const aggregate = await runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent });

    expect(creates).toHaveLength(2);
    const firstCloud = creates[0]?.cloud;
    const secondCloud = creates[1]?.cloud;
    expect(firstCloud?.repos).toHaveLength(1);
    expect(firstCloud?.repos[0]?.url).toBe('https://github.com/acme/a');
    expect(secondCloud?.repos).toHaveLength(1);
    expect(secondCloud?.repos[0]?.url).toBe('https://github.com/acme/b');

    expect(aggregate.status).toBe('finished');
    expect(aggregate.id).toBe('run-a,run-b');
    expect(aggregate.durationMs).toBe(200);
    expect(aggregate.git?.branches).toHaveLength(2);
    expect(aggregate.git?.branches.map((b) => b.prUrl)).toEqual([
      'https://github.com/acme/a/pull/1',
      'https://github.com/acme/b/pull/2',
    ]);
    expect(summarizeRunResult(aggregate)).toContain('https://github.com/acme/a/pull/1');
    expect(summarizeRunResult(aggregate)).toContain('https://github.com/acme/b/pull/2');
  });

  it('aggregates error when one repo rejects and preserves successful repo evidence', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      {
        wait: {
          id: 'run-a',
          status: 'finished',
          result: 'OK',
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
      { createError: new Error('Second agent failed') },
    ]);

    const aggregate = await runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent });

    expect(aggregate.status).toBe('error');
    expect(aggregate.git?.branches).toHaveLength(1);
    expect(aggregate.git?.branches[0]?.prUrl).toBe('https://github.com/acme/a/pull/1');
    expect(aggregate.result).toContain('Second agent failed');
    expect(aggregate.result).toContain('run-a');
    expect(summarizeRunResult(aggregate)).toContain('https://github.com/acme/a/pull/1');
  });

  it('aggregates error when one run returns error status while keeping finished repo git info', async () => {
    const creates: CreateOptions[] = [];
    const agent = makeFakeAgent(creates, [
      {
        wait: {
          id: 'run-a',
          status: 'finished',
          result: 'OK',
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
      {
        wait: {
          id: 'run-b',
          status: 'error',
          result: 'Remediation failed',
        },
      },
    ]);

    const aggregate = await runEnterpriseTask(cloudTwoRepoConfig(), devNull, { Agent: agent });

    expect(creates).toHaveLength(2);
    expect(aggregate.status).toBe('error');
    expect(aggregate.git?.branches).toHaveLength(1);
    expect(aggregate.git?.branches[0]?.prUrl).toBe('https://github.com/acme/a/pull/1');
    expect(aggregate.result).toContain('Remediation failed');
    expect(aggregate.result).toContain('[error] run-b');
  });
});
