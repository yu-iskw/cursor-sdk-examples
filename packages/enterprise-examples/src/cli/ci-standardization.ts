/**
 * CLI entrypoint for the `ci-standardization` task (default policy only).
 * Options, config loading, prompts, and SDK runs: ./cli-runner.ts and ../config.ts,
 * ../prompts.ts, ../sdk/run-agent.ts, ../fixtures/prompt-library.yml.
 */
import { runExampleCli } from './cli-runner';

const POLICY = [
  'Align CI with the enterprise baseline for build, test, lint, and security checks.',
  'Use least-privilege workflow permissions and preserve repository-specific deploy gates.',
  'Keep changes small enough for CODEOWNER review.',
].join('\n');

runExampleCli('ci-standardization', POLICY);
