/**
 * CLI entrypoint for the `dependency-remediation` task (default policy only).
 * Options, config loading, prompts, and SDK runs: ./cli-runner.ts and ../config.ts,
 * ../prompts.ts, ../sdk/run-agent.ts, ../fixtures/prompt-library.yml.
 */
import { runExampleCli } from './cli-runner';

const POLICY = [
  'Remediate vulnerable dependencies described by the current advisory or SCA report.',
  'Update dependency manifests and lockfiles for each ecosystem as applicable, with the smallest safe version changes.',
  'Run and report the validation commands (install, test, audit) appropriate to the repository before recommending merge.',
].join('\n');

runExampleCli('dependency-remediation', POLICY);
