import { describe, expect, it } from 'vitest';

import { createExampleCommand } from './cli-runner';

import type { EnterpriseTaskConfig } from '../types';

describe('createExampleCommand', () => {
  it('parses Commander options into the default local task config', async () => {
    let capturedConfig: EnterpriseTaskConfig | undefined;
    const command = createExampleCommand('ci-standardization', 'Default policy', async (config) => {
      capturedConfig = config;
    });

    await command.parseAsync(
      [
        '--dry-run',
        '--cwd',
        '/work/service-a',
        '--repo',
        'https://github.com/acme/service-a',
        '--policy',
        'Use the platform CI template.',
      ],
      { from: 'user' },
    );

    expect(capturedConfig).toMatchObject({
      task: 'ci-standardization',
      runtime: { type: 'local', cwd: '/work/service-a' },
      target: { repos: [{ repoUrl: 'https://github.com/acme/service-a' }] },
      policy: 'Use the platform CI template.',
      dryRun: true,
    });
  });
});
