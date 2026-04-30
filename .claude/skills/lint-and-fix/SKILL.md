---
name: lint-and-fix
description: Run linters and fix violations, formatting errors, or style mismatches using Trunk, plus Knip for unused dependencies and exports. Use when code quality checks fail, before submitting PRs, or to repair "broken" linting states.
---

# Lint and Fix Loop: Trunk + Knip

## Purpose

An autonomous loop for the agent to identify, fix, and verify linting and formatting violations using [Trunk](https://trunk.io), and **unused dependencies, exports, and workspace entrypoints** using [Knip](https://knip.dev) (`pnpm knip`), matching **`AGENTS.md`** layered quality harness.

## Loop Logic

1. **Identify**:
   - Run **`pnpm knip`** and capture unused files, dependencies, exports, and configuration hints.
   - Run **`pnpm lint`** (which executes `trunk check`) to list current violations.
2. **Analyze**: Examine Knip and Trunk output—file path, line number, and message.
3. **Fix**:
   - **Knip**: Remove or wire unused code; adjust **`knip.json`** entry/project paths when CLI or package entrypoints are real but not traced; remove truly unused dependencies from **`package.json`** with **`pnpm remove`** / workspace protocol as appropriate.
   - **Trunk — formatting**: Run `pnpm format` (which executes `trunk fmt`).
   - **Trunk — lint**: Apply the minimum necessary source change to resolve the error.
4. **Verify**: Re-run **`pnpm knip`** and **`pnpm lint`**.
   - If both pass: Move to the next issue or finish if all are resolved.
   - If either fails: Analyze the new failure and repeat the loop.

## Termination Criteria

- No more issues reported by **`pnpm knip`**.
- No more errors reported by **`pnpm lint`**.
- Reached max iteration limit (default: 5).

## Examples

### Scenario: Fixing a formatting violation

1. `pnpm knip` passes (or agent fixes Knip issues first).
2. `pnpm lint` reports formatting issues in `src/index.ts`.
3. Agent runs `pnpm format`.
4. `pnpm knip` and `pnpm lint` both pass.

### Scenario: Knip reports unused exports

1. `pnpm knip` lists an unused export.
2. Agent removes the export, adds a real entry in **`knip.json`**, or restores a missing import—whichever matches intent.
3. `pnpm knip` passes; then **`pnpm lint`** is still run before finishing.

## Resources

- [Trunk Documentation](https://docs.trunk.io/): Official documentation for the Trunk CLI.
- [Knip](https://knip.dev): Unused dependencies and exports; project **`pnpm knip`**.
