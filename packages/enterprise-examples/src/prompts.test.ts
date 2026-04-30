import { describe, expect, it } from 'vitest';

import { buildTaskPrompt } from './prompts';

import type { EnterpriseTaskConfig } from './types';

describe('buildTaskPrompt', () => {
  it('builds a governed dependency remediation prompt', () => {
    const config: EnterpriseTaskConfig = {
      task: 'dependency-remediation',
      runtime: { type: 'cloud' },
      target: {
        repos: [{ repoUrl: 'https://github.com/acme/service-a', startingRef: 'main' }],
      },
      policy: 'Remediate CVE-2026-0001 in npm dependencies.',
      validation: { commands: ['pnpm test', 'pnpm lint:security'] },
      guardrails: ['Preserve public APIs.'],
      model: { id: 'composer-2' },
      dryRun: true,
      autoCreatePR: true,
    };

    const prompt = buildTaskPrompt(config);

    expect(prompt).toContain('Task: Dependency and CVE remediation');
    expect(prompt).toContain('Repositories:');
    expect(prompt).toContain('- https://github.com/acme/service-a (ref: main)');
    expect(prompt).toContain('Dry-run mode: produce a plan and diff summary only');
    expect(prompt).toContain('- pnpm lint:security');
    expect(prompt).toContain('Preserve public APIs.');
    expect(prompt).toContain('Do not push directly to protected branches.');
  });
});
