/**
 * CLI entrypoint for the `repo-metadata-hygiene` task (default policy only).
 * Options, config loading, prompts, and SDK runs: ./cli-runner.ts and ../config.ts,
 * ../prompts.ts, ../sdk/run-agent.ts, ../fixtures/prompt-library.yml.
 */
import { runExampleCli } from './cli-runner';

const POLICY = [
  'Normalize CODEOWNERS, README ownership details, and service metadata from authoritative policy input.',
  'Do not invent owners, support channels, service tiers, or runbook links.',
  'Call out any missing source-of-truth data for human follow-up.',
].join('\n');

runExampleCli('repo-metadata-hygiene', POLICY);
