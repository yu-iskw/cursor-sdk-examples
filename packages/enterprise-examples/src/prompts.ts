import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import type { EnterpriseTaskConfig, EnterpriseTaskType, RepositoryTarget } from './types';

type PromptTaskCopy = {
  title: string;
  instructions: string[];
};

type PromptLibraryFile = {
  version: number;
  modes: {
    dryRun: string;
    execute: string;
  };
  defaultGuardrails: string[];
  tasks: Record<EnterpriseTaskType, PromptTaskCopy>;
  finalResponseRequirements: string[];
};

let cachedPromptLibrary: PromptLibraryFile | undefined;

export function buildTaskPrompt(config: EnterpriseTaskConfig): string {
  const PROMPT_LIBRARY = loadPromptLibrary();
  const validationCommands = config.validation?.commands ?? [];
  const guardrails = [...PROMPT_LIBRARY.defaultGuardrails, ...config.guardrails];
  const mode = config.dryRun ? PROMPT_LIBRARY.modes.dryRun : PROMPT_LIBRARY.modes.execute;
  const taskCopy = PROMPT_LIBRARY.tasks[config.task];
  if (taskCopy === undefined) {
    throw new Error(`Missing prompt fixture copy for task "${config.task}"`);
  }

  return [
    `Task: ${taskCopy.title}`,
    formatRepositories(config.target.repos),
    `Runtime: ${config.runtime.type}`,
    `PR creation requested: ${config.autoCreatePR ? 'yes' : 'no'}`,
    mode,
    '',
    'Policy:',
    config.policy,
    '',
    'Task-specific instructions:',
    formatBullets(taskCopy.instructions),
    '',
    'Validation commands:',
    validationCommands.length > 0
      ? formatBullets(validationCommands)
      : '- No validation commands provided.',
    '',
    'Guardrails:',
    formatBullets(guardrails),
    '',
    'Final response requirements:',
    formatBullets(PROMPT_LIBRARY.finalResponseRequirements),
  ].join('\n');
}

function formatBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function formatRepositories(repos: RepositoryTarget[]): string {
  const lines = repos.map((repo) => {
    const refLabel =
      repo.startingRef === undefined || repo.startingRef.length === 0
        ? 'default branch'
        : repo.startingRef;
    return `- ${repo.repoUrl} (ref: ${refLabel})`;
  });

  return ['Repositories:', ...lines].join('\n');
}

function loadPromptLibrary(): PromptLibraryFile {
  if (cachedPromptLibrary !== undefined) {
    return cachedPromptLibrary;
  }

  const fixturePath = path.join(__dirname, 'fixtures', 'prompt-library.yml');
  // Fixture filename is fixed; content is the operational prompt library for these examples.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed: unknown = parseYaml(raw);
  cachedPromptLibrary = assertPromptLibrary(parsed);
  return cachedPromptLibrary;
}

function assertPromptLibrary(raw: unknown): PromptLibraryFile {
  const root = expectRecord(raw, 'prompt-library.yml must parse to an object');

  return {
    version: expectNumber(root.version, 'prompt-library.yml missing numeric version'),
    modes: parseModes(root.modes),
    defaultGuardrails: expectStringArray(
      root.defaultGuardrails,
      'prompt-library.yml defaultGuardrails must be a string array',
    ),
    tasks: parseTasks(root.tasks),
    finalResponseRequirements: expectStringArray(
      root.finalResponseRequirements,
      'prompt-library.yml finalResponseRequirements must be a string array',
    ),
  };
}

function parseModes(raw: unknown): PromptLibraryFile['modes'] {
  const modes = expectRecord(raw, 'prompt-library.yml missing modes map');

  return {
    dryRun: expectString(modes.dryRun, 'prompt-library.yml modes.dryRun must be a string'),
    execute: expectString(modes.execute, 'prompt-library.yml modes.execute must be a string'),
  };
}

function parseTasks(raw: unknown): Record<EnterpriseTaskType, PromptTaskCopy> {
  const tasksRaw = expectRecord(raw, 'prompt-library.yml missing tasks map');

  return {
    'dependency-remediation': parsePromptTaskCopy(
      tasksRaw['dependency-remediation'],
      'prompt-library.yml missing tasks.dependency-remediation',
      'prompt-library.yml tasks.dependency-remediation',
    ),
    'ci-standardization': parsePromptTaskCopy(
      tasksRaw['ci-standardization'],
      'prompt-library.yml missing tasks.ci-standardization',
      'prompt-library.yml tasks.ci-standardization',
    ),
    'repo-metadata-hygiene': parsePromptTaskCopy(
      tasksRaw['repo-metadata-hygiene'],
      'prompt-library.yml missing tasks.repo-metadata-hygiene',
      'prompt-library.yml tasks.repo-metadata-hygiene',
    ),
  };
}

function parsePromptTaskCopy(
  raw: unknown,
  missingMessage: string,
  taskPrefix: string,
): PromptTaskCopy {
  const taskRecord = expectRecord(raw, missingMessage);

  return {
    title: expectString(taskRecord.title, `${taskPrefix}.title must be a string`),
    instructions: expectStringArray(
      taskRecord.instructions,
      `${taskPrefix}.instructions must be a string array`,
    ),
  };
}

function expectRecord(raw: unknown, message: string): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new Error(message);
  }

  return raw;
}

function expectNumber(raw: unknown, message: string): number {
  if (typeof raw !== 'number') {
    throw new Error(message);
  }

  return raw;
}

function expectString(raw: unknown, message: string): string {
  if (typeof raw !== 'string') {
    throw new Error(message);
  }

  return raw;
}

function expectStringArray(raw: unknown, message: string): string[] {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    throw new Error(message);
  }

  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
