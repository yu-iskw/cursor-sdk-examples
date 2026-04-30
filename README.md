# Cursor SDK Examples

Cookbook-style TypeScript examples for using the Cursor SDK in governed repository automation workflows.

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/)
- Node.js (see `.node-version`)

Linting and formatting use [Trunk](https://trunk.io/) (ESLint, Prettier, and more). The Trunk **launcher** is installed with project dependencies—you do not need a separate Trunk install for the default workflow.

### Installation

```bash
pnpm install
```

Optional: prefetch Trunk’s hermetic tools (helpful for offline work or CI images):

```bash
pnpm exec trunk install
```

If you prefer a global `trunk` on your PATH, see the [Trunk installation guide](https://docs.trunk.io/references/cli/getting-started/install) (e.g. `brew install trunk-io` on macOS).

### Development

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples build
```

### Build

```bash
pnpm build
```

### Linting & Formatting

```bash
pnpm lint
pnpm format
```

## Project Structure

- `packages/`: Monorepo packages
  - `common/`: Shared utilities and types
  - `enterprise-examples/`: Cursor SDK cookbook; CLI entrypoints in `src/cli/`, shared prompt and SDK wiring in `src/`

## Enterprise Cursor SDK Examples

The enterprise examples demonstrate the SDK as a workflow engine for repeatable, auditable code changes. Each example builds a governed prompt, streams SDK run progress, and summarizes branch, PR, and artifact evidence.

Runnable workflows are **CLI entrypoints** under `packages/enterprise-examples/src/cli/` (shared harness in `cli-runner.ts`). Full CLI usage, **`sqlite3`** setup for live runs, **dry-run vs live**, and **pnpm argv** (Commander) notes are in [`packages/enterprise-examples/README.md`](packages/enterprise-examples/README.md).

### Environment

```bash
export CURSOR_API_KEY="your-key"
pnpm --filter @cursor-sdk-examples/enterprise-examples build
```

For **live** agent runs, `@cursor/sdk` needs a working native **`sqlite3`** binding. The root `package.json` **allowlists** `sqlite3` in **`pnpm.onlyBuiltDependencies`** so `pnpm install` runs its build. Use Node from `.node-version`. If you still see missing binding errors, run `rm -rf node_modules && pnpm install` or `pnpm rebuild sqlite3`. **Dry-run** prompts do not load the SDK and do not need `sqlite3`. Details: [Enterprise README — Native sqlite3](packages/enterprise-examples/README.md#native-sqlite3-live-sdk-runs-only).

### Dry-Run Prompts

Dry-run mode prints the prompt that would be sent to the SDK agent and does not load the SDK or edit files:

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation --dry-run
pnpm --filter @cursor-sdk-examples/enterprise-examples ci-standardization --dry-run
pnpm --filter @cursor-sdk-examples/enterprise-examples repo-metadata-hygiene --dry-run
```

### Config-Driven Cloud Runs

Sample configs live in `packages/enterprise-examples/configs/`. Each lists **`target.repos`** with placeholder URLs (often two repos); replace them and the policy text before running with `dryRun: false`.

`pnpm --filter` runs the script with cwd `packages/enterprise-examples`; use **`configs/…`** for `--config` (not `packages/enterprise-examples/configs/…`).

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation --config configs/dependency-remediation.yml
pnpm --filter @cursor-sdk-examples/enterprise-examples ci-standardization --config configs/ci-standardization.yml
pnpm --filter @cursor-sdk-examples/enterprise-examples repo-metadata-hygiene --config configs/repo-metadata-hygiene.yml
```

Pass flags directly after the script name (see [Passing flags through pnpm](packages/enterprise-examples/README.md#passing-flags-through-pnpm)); avoid an extra `--` before `--config` so Commander does not treat `--config` as a positional argument.

### Guardrails

The examples default to PR-oriented workflows, minimal diffs, explicit validation commands, and secret-safe prompts. They do not auto-merge, push directly to protected branches, or hardcode real organization repositories or tokens.

## License

Apache-2.0
