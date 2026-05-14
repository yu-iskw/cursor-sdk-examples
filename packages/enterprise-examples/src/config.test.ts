import { describe, expect, it } from 'vitest';

import { parseTaskConfig } from './config';

describe('parseTaskConfig', () => {
  it('normalizes a local dependency remediation task from legacy target.repoUrl', () => {
    const config = parseTaskConfig({
      task: 'dependency-remediation',
      runtime: { type: 'local', cwd: '/work/service-a' },
      target: { repoUrl: 'https://github.com/acme/service-a', startingRef: 'main' },
      policy: 'Fix vulnerable npm dependencies.',
      validation: { commands: ['pnpm test', 'pnpm lint:security'] },
    });

    expect(config).toEqual({
      task: 'dependency-remediation',
      runtime: { type: 'local', cwd: '/work/service-a' },
      target: {
        repos: [{ repoUrl: 'https://github.com/acme/service-a', startingRef: 'main' }],
      },
      policy: 'Fix vulnerable npm dependencies.',
      validation: { commands: ['pnpm test', 'pnpm lint:security'] },
      guardrails: [],
      model: { id: 'composer-2' },
      dryRun: false,
      autoCreatePR: false,
    });
  });

  it('parses model.id from config', () => {
    const config = parseTaskConfig({
      task: 'dependency-remediation',
      runtime: { type: 'local', cwd: '/tmp' },
      target: { repoUrl: 'https://github.com/acme/x' },
      policy: 'x',
      model: { id: 'composer-2' },
    });

    expect(config.model).toEqual({ id: 'composer-2' });
  });

  it('accepts target.repos for cloud multi-repo configs', () => {
    const config = parseTaskConfig({
      task: 'ci-standardization',
      runtime: { type: 'cloud' },
      target: {
        repos: [
          { repoUrl: 'https://github.com/acme/a', startingRef: 'main' },
          { repoUrl: 'https://github.com/acme/b', startingRef: 'develop' },
        ],
      },
      policy: 'Align CI with the platform template.',
    });

    expect(config.target.repos).toHaveLength(2);
    expect(config.target.repos[1]?.repoUrl).toBe('https://github.com/acme/b');
  });

  it('rejects cloud tasks when any repository URL is empty', () => {
    expect(() =>
      parseTaskConfig({
        task: 'ci-standardization',
        runtime: { type: 'cloud' },
        target: { repoUrl: '' },
        policy: 'Align CI with the platform template.',
      }),
    ).toThrow('Cloud runs require a non-empty repoUrl for each entry in target.repos');
  });

  it('rejects local runtime with multiple repositories', () => {
    expect(() =>
      parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'local', cwd: '/work/a' },
        target: {
          repos: [
            { repoUrl: 'https://github.com/acme/a' },
            { repoUrl: 'https://github.com/acme/b' },
          ],
        },
        policy: 'Fix deps.',
      }),
    ).toThrow('Multiple repositories require runtime.type: cloud');
  });

  it('rejects target when both repos and repoUrl are set', () => {
    expect(() =>
      parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'cloud' },
        target: {
          repoUrl: 'https://github.com/acme/a',
          repos: [{ repoUrl: 'https://github.com/acme/b' }],
        },
        policy: 'Fix deps.',
      }),
    ).toThrow('target must use either repos[] or repoUrl, not both');
  });

  it('parses cloudEnvVarNames for cloud configs', () => {
    const config = parseTaskConfig({
      task: 'dependency-remediation',
      runtime: { type: 'cloud' },
      target: { repoUrl: 'https://github.com/acme/a' },
      policy: 'Fix deps.',
      cloudEnvVarNames: ['NPM_TOKEN', 'PIP_INDEX_URL'],
    });

    expect(config.cloudEnvVarNames).toEqual(['NPM_TOKEN', 'PIP_INDEX_URL']);
  });

  it('rejects cloudEnvVarNames entries starting with CURSOR_', () => {
    expect(() =>
      parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'cloud' },
        target: { repoUrl: 'https://github.com/acme/a' },
        policy: 'Fix deps.',
        cloudEnvVarNames: ['CURSOR_API_KEY'],
      }),
    ).toThrow('cloudEnvVarNames must not include names starting with CURSOR_');
  });

  it('rejects cloudEnvVarNames for local runtime', () => {
    expect(() =>
      parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'local', cwd: '/work/a' },
        target: { repoUrl: 'https://github.com/acme/a' },
        policy: 'Fix deps.',
        cloudEnvVarNames: ['NPM_TOKEN'],
      }),
    ).toThrow('cloudEnvVarNames is only valid for runtime.type: cloud');
  });

  it('rejects cloudEnvVarNames with invalid shell-style names', () => {
    expect(() =>
      parseTaskConfig({
        task: 'dependency-remediation',
        runtime: { type: 'cloud' },
        target: { repoUrl: 'https://github.com/acme/a' },
        policy: 'Fix deps.',
        cloudEnvVarNames: ['PKG-TOKEN'],
      }),
    ).toThrow('cloudEnvVarNames entry "PKG-TOKEN" must match');
  });
});
