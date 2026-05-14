import { readFileSync } from 'node:fs';

import { parse as parseYaml } from 'yaml';

import { TASK_TYPES } from './types';

import type {
  CloudRuntimeConfig,
  EnterpriseTaskConfig,
  EnterpriseTaskTarget,
  EnterpriseTaskType,
  RepositoryTarget,
  RuntimeConfig,
} from './types';

const DEFAULT_MODEL = 'composer-2';

const TASKS = new Set<EnterpriseTaskType>(TASK_TYPES);

export function loadTaskConfig(path: string): EnterpriseTaskConfig {
  // Example CLI input is intentionally file-based; callers choose the config path.
  // YAML parser accepts JSON as well, so .json configs remain valid if present.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const raw = parseYaml(readFileSync(path, 'utf8')) as unknown;
  return parseTaskConfig(raw);
}

export function parseTaskConfig(raw: unknown): EnterpriseTaskConfig {
  const record = requireRecord(raw, 'config');
  const task = requireTask(record.task);
  const runtime = parseRuntime(record.runtime);
  const policy = requireString(record.policy, 'policy');
  const target = parseTarget(record.target, runtime);
  const cloudEnvVarNames = parseOptionalCloudEnvVarNames(record.cloudEnvVarNames);
  if (runtime.type === 'local' && cloudEnvVarNames !== undefined && cloudEnvVarNames.length > 0) {
    throw new Error('cloudEnvVarNames is only valid for runtime.type: cloud');
  }

  return {
    task,
    runtime,
    target,
    policy,
    validation: parseValidation(record.validation),
    guardrails: optionalStringArray(record.guardrails, 'guardrails'),
    model: parseModel(record.model),
    dryRun: optionalBoolean(record.dryRun, false, 'dryRun'),
    autoCreatePR: optionalBoolean(record.autoCreatePR, false, 'autoCreatePR'),
    ...(cloudEnvVarNames !== undefined && cloudEnvVarNames.length > 0 ? { cloudEnvVarNames } : {}),
  };
}

function parseOptionalCloudEnvVarNames(raw: unknown): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
    throw new Error('cloudEnvVarNames must be an array of strings');
  }

  const names = raw as string[];
  const safeName = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const name of names) {
    if (name.startsWith('CURSOR_')) {
      throw new Error('cloudEnvVarNames must not include names starting with CURSOR_');
    }

    if (!safeName.test(name)) {
      throw new Error(
        `cloudEnvVarNames entry "${name}" must match /^[A-Za-z_][A-Za-z0-9_]*$/ (shell-style variable names)`,
      );
    }
  }

  if (names.length === 0) {
    return undefined;
  }

  return names;
}

function parseTarget(raw: unknown, runtime: RuntimeConfig): EnterpriseTaskTarget {
  const target = requireRecord(raw, 'target');
  const hasReposKey = Object.hasOwn(target, 'repos');
  const hasLegacyRepoUrl = Object.hasOwn(target, 'repoUrl');

  if (hasReposKey && hasLegacyRepoUrl) {
    throw new Error('target must use either repos[] or repoUrl, not both');
  }

  let repos: RepositoryTarget[];

  if (hasReposKey) {
    const reposRaw = target.repos;
    if (!Array.isArray(reposRaw)) {
      throw new Error('target.repos must be an array');
    }

    if (reposRaw.length === 0) {
      throw new Error('target.repos must not be empty');
    }

    repos = reposRaw.map((entry, index) => parseRepoEntry(entry, index));
  } else if (hasLegacyRepoUrl) {
    const repoUrl = requireString(target.repoUrl, 'target.repoUrl');
    repos = [{ repoUrl, startingRef: optionalString(target.startingRef, 'target.startingRef') }];
  } else {
    throw new Error('target must include repos[] or repoUrl');
  }

  if (runtime.type === 'local' && repos.length > 1) {
    throw new Error('Multiple repositories require runtime.type: cloud');
  }

  if (runtime.type === 'cloud' && repos.some((r) => r.repoUrl.length === 0)) {
    throw new Error('Cloud runs require a non-empty repoUrl for each entry in target.repos');
  }

  return { repos };
}

function parseRepoEntry(raw: unknown, index: number): RepositoryTarget {
  const label = `target.repos[${index}]`;
  const entry = requireRecord(raw, label);
  return {
    repoUrl: requireString(entry.repoUrl, `${label}.repoUrl`),
    startingRef: optionalString(entry.startingRef, `${label}.startingRef`),
  };
}

function parseRuntime(raw: unknown): RuntimeConfig {
  const runtime = requireRecord(raw, 'runtime');
  const type = requireString(runtime.type, 'runtime.type');

  if (type === 'local') {
    const settingSources = optionalStringArray(runtime.settingSources, 'runtime.settingSources');
    return {
      type,
      cwd: requireString(runtime.cwd, 'runtime.cwd'),
      ...(settingSources.length > 0 ? { settingSources } : {}),
    };
  }

  if (type === 'cloud') {
    return {
      type,
      env: parseCloudEnv(runtime.env),
    };
  }

  throw new Error('runtime.type must be "local" or "cloud"');
}

function parseCloudEnv(raw: unknown): CloudRuntimeConfig['env'] {
  if (raw === undefined) {
    return undefined;
  }

  const env = requireRecord(raw, 'runtime.env');
  const type = requireString(env.type, 'runtime.env.type');

  if (type !== 'cloud' && type !== 'pool' && type !== 'machine') {
    throw new Error('runtime.env.type must be "cloud", "pool", or "machine"');
  }

  return { type, name: optionalString(env.name, 'runtime.env.name') };
}

function parseValidation(raw: unknown): EnterpriseTaskConfig['validation'] {
  if (raw === undefined) {
    return undefined;
  }

  const validation = requireRecord(raw, 'validation');
  return { commands: optionalStringArray(validation.commands, 'validation.commands') };
}

function parseModel(raw: unknown): EnterpriseTaskConfig['model'] {
  if (raw === undefined) {
    return { id: DEFAULT_MODEL };
  }

  const model = requireRecord(raw, 'model');
  return { id: requireString(model.id, 'model.id') };
}

function requireTask(raw: unknown): EnterpriseTaskType {
  const task = requireString(raw, 'task');
  if (!TASKS.has(task as EnterpriseTaskType)) {
    throw new Error(`Unsupported task: ${task}`);
  }

  return task as EnterpriseTaskType;
}

function requireRecord(raw: unknown, name: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${name} must be an object`);
  }

  return raw as Record<string, unknown>;
}

function requireString(raw: unknown, name: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`${name} must be a string`);
  }

  return raw;
}

function optionalString(raw: unknown, name: string): string | undefined {
  if (raw === undefined) {
    return undefined;
  }

  return requireString(raw, name);
}

function optionalBoolean(raw: unknown, defaultValue: boolean, name: string): boolean {
  if (raw === undefined) {
    return defaultValue;
  }

  if (typeof raw !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }

  return raw;
}

function optionalStringArray(raw: unknown, name: string): string[] {
  if (raw === undefined) {
    return [];
  }

  if (!Array.isArray(raw) || raw.some((value) => typeof value !== 'string')) {
    throw new Error(`${name} must be an array of strings`);
  }

  return raw;
}
