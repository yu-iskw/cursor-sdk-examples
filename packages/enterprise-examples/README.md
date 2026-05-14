# Enterprise Cursor SDK Examples

Cookbook-style examples for using the Cursor SDK as a governed repository automation layer. The examples focus on three enterprise workflows:

- `dependency-remediation`: remediate vulnerable or disallowed dependencies.
- `ci-standardization`: align CI/CD configuration with a platform baseline.
- `repo-metadata-hygiene`: update CODEOWNERS, README ownership details, and service metadata from policy input.

Each workflow builds a policy-aware prompt, streams Cursor SDK run progress, and summarizes run evidence such as branches, PR URLs, and artifacts.

## CLI entrypoints

The **`pnpm`** scripts invoke thin **CLI entry files** under [`src/cli/`](src/cli/): each file only defines a **default policy** string and calls the shared harness in [`cli-runner.ts`](src/cli/cli-runner.ts). Shared behavior—task config parsing, prompt assembly, lazy SDK load—is in [`config.ts`](src/config.ts), [`prompts.ts`](src/prompts.ts), [`sdk/run-agent.ts`](src/sdk/run-agent.ts), and [`src/fixtures/prompt-library.yml`](src/fixtures/prompt-library.yml).

## Setup

From the repository root:

```bash
pnpm install
pnpm --filter @cursor-sdk-examples/enterprise-examples build
```

Use the Node.js version from the repository root (see `.node-version` and `package.json` `engines`) so native addons match the current Node ABI.

Set a Cursor API key before **live** SDK runs (not needed for `--dry-run`):

```bash
export CURSOR_API_KEY="your-key"
```

### Native `sqlite3` (live SDK runs only)

`@cursor/sdk` loads a transitive **`sqlite3`** package with a native addon (`node_sqlite3.node`). **Prompt-only** runs use `--dry-run` and never import the SDK, so they do **not** need `sqlite3`. **Live** runs do.

**pnpm 10** does not run dependency `install` / `postinstall` scripts unless the package is allowlisted. This repository’s root [`package.json`](../../package.json) sets **`pnpm.onlyBuiltDependencies`** to include **`sqlite3`** (and **`esbuild`**, used by the toolchain) so a normal **`pnpm install`** compiles or downloads the native binary for `sqlite3`. Clones and clean installs should work without extra steps.

If you still see `Could not locate the bindings file` for `sqlite3` (for example after upgrading Node or copying `node_modules` from another machine):

1. Reinstall so the `sqlite3` install script runs again:

   ```bash
   rm -rf node_modules
   pnpm install
   ```

2. Or rebuild only the addon:

   ```bash
   pnpm rebuild sqlite3
   ```

3. If pnpm shows build scripts were ignored, allow them and reinstall:

   ```bash
   pnpm approve-builds
   pnpm install
   ```

4. Confirm the binary exists (paths may vary by platform):

   ```bash
   ls node_modules/.pnpm/sqlite3@*/node_modules/sqlite3/build/Release/node_sqlite3.node 2>/dev/null \
     || ls node_modules/.pnpm/sqlite3@*/node_modules/sqlite3/lib/binding/*/node_sqlite3.node
   ```

### Dry-run vs live

| Goal                                                     | What to run                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Inspect the generated prompt only (no SDK, no `sqlite3`) | Add **`--dry-run`** (or set `dryRun: true` in YAML).                           |
| Run the Cursor agent against the API                     | Omit `--dry-run`, set `CURSOR_API_KEY`, and ensure `sqlite3` is built (above). |

## Commands

The package exposes three scripts:

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation
pnpm --filter @cursor-sdk-examples/enterprise-examples ci-standardization
pnpm --filter @cursor-sdk-examples/enterprise-examples repo-metadata-hygiene
```

All commands use Commander and support the same options:

```text
-c, --config <path>  path to a YAML task config
--cwd <path>         local workspace path for default local runs
--repo <url>         repository URL for prompt context
--policy <text>      policy text to include in the generated prompt
--dry-run            print the generated prompt without starting an SDK agent
```

### Passing flags through pnpm

Commander treats a bare `--` in **Node’s argv** as “end of options.” If the process is started as `node dist/cli/<script>.js -- --config <path>`, then `--config` and `<path>` are **not** parsed as flags and you may see `too many arguments`.

**Preferred:** pass script flags immediately after the script name (no extra `--` before `--config` or `--dry-run`).

`pnpm --filter … <script>` runs with **current working directory** set to this package (`packages/enterprise-examples`), so `--config` paths are relative to that directory (for example `configs/dependency-remediation.yml`). If you invoke `node dist/cli/…` from the **repository root** instead, use `packages/enterprise-examples/configs/…`.

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation --dry-run
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation --config configs/dependency-remediation.yml
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation -c configs/dependency-remediation.yml
```

With `pnpm run`, a single `--` separates **pnpm’s** arguments from the script’s arguments: `pnpm --filter ... run dependency-remediation -- --dry-run` forwards `--dry-run` to Node. Do **not** add **another** `--` before `--config`.

**Direct invocation** (after `build`, from repo root):

```bash
node packages/enterprise-examples/dist/cli/dependency-remediation.js --config packages/enterprise-examples/configs/dependency-remediation.yml --dry-run
```

## Dry Runs

Dry runs print the exact prompt that would be sent to the agent. They do **not** load `@cursor/sdk` and do not require the `sqlite3` native module.

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation --dry-run
pnpm --filter @cursor-sdk-examples/enterprise-examples ci-standardization --dry-run
pnpm --filter @cursor-sdk-examples/enterprise-examples repo-metadata-hygiene --dry-run
```

You can override the default local prompt context:

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples ci-standardization \
  --dry-run \
  --cwd /path/to/workspace \
  --repo https://github.com/your-org/your-repo \
  --policy "Align this repo with the platform CI baseline."
```

## Config-Driven Runs

Sample configs live in `configs/`. Replace placeholder repository URLs and policy text before live runs. With **`pnpm --filter …`** from the repo root, cwd is this package—use **`configs/…`**:

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples dependency-remediation \
  --config configs/dependency-remediation.yml
```

Config shape (YAML): use **`target.repos`** (non-empty list of `repoUrl` and optional `startingRef` per repo). For a single repository you may still use the legacy flat **`target.repoUrl`** / **`target.startingRef`** fields instead of `repos`. Do not set both `repos` and `repoUrl` on the same `target`. Multiple repositories require **`runtime.type: cloud`**; local runs allow exactly one repository.

For **live cloud runs** with **more than one** `target.repos` entry, the runner starts **one** Cursor SDK cloud agent whose `cloud.repos` lists every URL (multi-repo workspace on the VM), matching [CloudOptions in the TypeScript SDK](https://cursor.com/docs/sdk/typescript). The agent receives **one** generated prompt that lists all repositories. **`--dry-run`** prints that same combined prompt.

### Development environments (Dockerfile as code)

Cursor cloud agents can run in **named development environments** (Dockerfile-based images, build secrets, governance). Define and version those environments in the Cursor product; this package only **selects** an environment by name on the SDK call via `runtime.env`. See Cursor’s post on [development environments for agents](https://cursor.com/blog/cloud-agent-development-environments#environment-configuration-as-code) and [CloudOptions.env](https://cursor.com/docs/sdk/typescript).

```yaml
runtime:
  type: cloud
  env:
    type: cloud
    name: my-team-dockerfile-env # must match a dashboard environment name
```

### Session env vars passed into the cloud VM (optional)

To forward **non-secret names only** in YAML and supply values from the shell or CI, set **`cloudEnvVarNames`** to a list of `process.env` keys. At run time, only keys that are **set and non-empty** are sent as SDK **`cloud.envVars`**. Names must **not** start with `CURSOR_` (SDK rule). Do **not** commit secret values in YAML.

```yaml
runtime:
  type: cloud
target:
  repos:
    - repoUrl: https://github.com/your-org/service-a
cloudEnvVarNames:
  - NPM_TOKEN
  - PIP_INDEX_URL
```

Each name must match `^[A-Za-z_][A-Za-z0-9_]*$` and must not start with `CURSOR_`.

### LLM model (optional)

- **`model.id`** selects the Cursor SDK model passed to `Agent.create({ model })`. It is **optional**; when omitted, the default is **`composer-2`** (see `DEFAULT_MODEL` in `src/config.ts`).
- Valid model ids depend on your Cursor account and team policy. See the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript) and use discovery APIs such as `Cursor.models.list()` when your environment supports them.
- Text in **`policy:`** does **not** set the SDK model; only the **`model`** field in the YAML (or the default) controls `Agent.create` model selection.

```yaml
task: dependency-remediation
# model: { id: … } is optional; default is composer-2
model:
  id: composer-2
runtime:
  type: cloud
target:
  repos:
    - repoUrl: https://github.com/your-org/service-a
      startingRef: main
    - repoUrl: https://github.com/your-org/service-b
      startingRef: develop
policy: Describe the required repository change.
validation:
  commands:
    - pnpm test
    - pnpm lint
guardrails:
  - Keep diffs minimal and reviewable.
dryRun: true
autoCreatePR: true
```

For local runs, use one repo only:

```yaml
runtime:
  type: local
  cwd: /path/to/workspace
target:
  repos:
    - repoUrl: https://github.com/your-org/your-repo
```

### Dependency remediation across stacks

Orchestration (task type, `target.repos`, `policy`, `guardrails`, SDK cloud `repos`) is **language-neutral**. Concrete toolchain work belongs in **`validation.commands`** and in **`policy`**:

- **Manifests and lockfiles** depend on the ecosystem (for example `package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, Maven/Gradle lock semantics).
- **`validation.commands`** should list the **real** install, build, test, and security or audit commands for the repository this run targets (for example `./mvnw verify`, `pip install -e ".[dev]" && pytest`, `cargo build && cargo audit`, `go test ./...`).
- **One config, one command list:** the generated prompt includes a **single** bullet list under “Validation commands.” Repositories that need **different** commands should use **separate config files**, **separate runs**, or **policy text** that spells out per-repository steps until the schema supports per-repo command maps.
- **`runtime.type: cloud`** with **multiple** `target.repos` still emits **one shared** `validation.commands` list for the generated prompt, and the **single** cloud agent uses that list for all clones in the workspace—avoid mixing heterogeneous stacks in one YAML unless **policy** spells out per-repo steps or you use **separate config files** per stack.

**Example (Python-oriented `validation.commands`):**

```yaml
task: dependency-remediation
runtime:
  type: cloud
target:
  repos:
    - repoUrl: https://github.com/your-org/python-service
      startingRef: main
policy: >-
  Remediate findings from the latest pip-audit report. Prefer minimal version bumps; preserve public APIs.
validation:
  commands:
    - pip install -e ".[dev]"
    - pytest
    - pip-audit
guardrails:
  - Do not pin unrelated transitive upgrades.
dryRun: true
autoCreatePR: true
```

## Runtime Behavior

- `dryRun: true` or `--dry-run` prints the generated prompt and does not start the SDK agent or load `@cursor/sdk`.
- Local runtime uses `Agent.create({ local: { cwd } })` against a workspace on disk; **`target.repos` must list exactly one repository**.
- Cloud runtime uses `Agent.create({ cloud: { env, repos, autoCreatePR, envVars? } })` for repository-backed runs. Every `target.repos` entry becomes one element of **`cloud.repos`** (see [Creating agents](https://cursor.com/docs/sdk/typescript)); **multiple URLs mean one agent and one multi-repo workspace**, not multiple separate `Agent.create` calls.
- **`autoCreatePR`** and how many PRs open for a multi-repo run depend on your Cursor team and repository setup—validate in staging before relying on it for production automation.
- Live runs require `CURSOR_API_KEY` and a working **`sqlite3`** native binding (see [Native sqlite3](#native-sqlite3-live-sdk-runs-only)).

## Guardrails

The generated prompts include baseline enterprise guardrails:

- Work in PR-only mode and do not push directly to protected branches.
- Prefer minimal, reviewable diffs over broad refactors.
- Do not read, print, or commit secrets such as `.env` files, credentials, or tokens.
- Preserve public behavior unless the policy explicitly requires a change.
- Report validation commands run, skipped commands, and remaining risk.

## Prompt fixtures

Static prompt copy (default guardrails, task titles/instructions, dry-run vs execution wording, and final response requirements) lives in:

- `src/fixtures/prompt-library.yml`

Edit that YAML to tune operational prompts without changing TypeScript logic. The package build copies the YAML next to compiled output so runtime scripts resolve it from `dist/fixtures/`.

## Development

Run the package build:

```bash
pnpm --filter @cursor-sdk-examples/enterprise-examples build
```

Run all repository checks:

```bash
pnpm build
pnpm test
pnpm lint:eslint
```
