import { Command } from 'commander';

import { loadTaskConfig, parseTaskConfig } from '../config';
import { buildTaskPrompt } from '../prompts';
import { runEnterpriseTask, summarizeRunResult } from '../sdk/run-agent';

import type { EnterpriseTaskConfig, EnterpriseTaskType } from '../types';

interface ExampleCliOptions {
  config?: string;
  cwd?: string;
  repo?: string;
  policy?: string;
  dryRun?: boolean;
}

type ExecuteExample = (config: EnterpriseTaskConfig) => Promise<void>;

export async function runExample(task: EnterpriseTaskType, fallbackPolicy: string): Promise<void> {
  await createExampleCommand(task, fallbackPolicy).parseAsync();
}

export function runExampleCli(task: EnterpriseTaskType, fallbackPolicy: string): void {
  runExample(task, fallbackPolicy).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export function createExampleCommand(
  task: EnterpriseTaskType,
  fallbackPolicy: string,
  execute: ExecuteExample = executeExampleTask,
): Command {
  return new Command()
    .name(task)
    .description(`Run the Cursor SDK ${task} enterprise task CLI`)
    .option('-c, --config <path>', 'path to a YAML (or JSON) task config file')
    .option('--cwd <path>', 'local workspace path for default local runs')
    .option('--repo <url>', 'repository URL for prompt context')
    .option('--policy <text>', 'policy text to include in the generated prompt')
    .option('--dry-run', 'print the generated prompt without starting an SDK agent')
    .showHelpAfterError()
    .action(async (options: ExampleCliOptions) => {
      await execute(getConfig(task, fallbackPolicy, options));
    });
}

async function executeExampleTask(config: EnterpriseTaskConfig): Promise<void> {
  if (config.dryRun) {
    process.stdout.write(`${buildTaskPrompt(config)}\n`);
    return;
  }

  const result = await runEnterpriseTask(config);
  process.stdout.write(`${summarizeRunResult(result)}\n`);
}

function getConfig(
  task: EnterpriseTaskType,
  fallbackPolicy: string,
  options: ExampleCliOptions,
): EnterpriseTaskConfig {
  if (options.config !== undefined) {
    const loaded = loadTaskConfig(options.config);
    if (loaded.task !== task) {
      throw new Error(`Expected task "${task}" but config contains "${loaded.task}"`);
    }

    if (options.dryRun === true) {
      return { ...loaded, dryRun: true };
    }

    return loaded;
  }

  const cwd = options.cwd ?? process.cwd();
  const repoUrl = options.repo ?? `file://${cwd}`;
  const policy = options.policy ?? fallbackPolicy;

  return parseTaskConfig({
    task,
    runtime: { type: 'local', cwd },
    target: { repos: [{ repoUrl }] },
    policy,
    dryRun: options.dryRun ?? false,
    validation: { commands: ['pnpm test', 'pnpm lint'] },
  });
}
