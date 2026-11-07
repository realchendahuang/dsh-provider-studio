#!/usr/bin/env node
/**
 * Coverage gate: run the unit suite with Node's built-in coverage and fail when
 * line / branch / function coverage drops below the thresholds.
 *
 * README: the numbers live here (not in `package.json`) because the exclude
 * pattern must reach Node as one argument — shell quoting of `test/**` differs
 * between bash/zsh and Windows cmd, and a silently dropped pattern would count
 * the test files themselves and inflate every metric.
 *
 * Baseline at v1.3.0 (with `test/**` excluded): 88.86 line / 84.12 branch /
 * 92.92 funcs. Thresholds sit 1–2 points lower so ordinary refactors do not
 * fail the build while a real coverage loss still does.
 *
 * Run: node scripts/coverage.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const THRESHOLDS = {
  lines: 87,
  branches: 82,
  functions: 91,
}

const result = spawnSync(process.execPath, [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-exclude=test/**',
  `--test-coverage-lines=${THRESHOLDS.lines}`,
  `--test-coverage-branches=${THRESHOLDS.branches}`,
  `--test-coverage-functions=${THRESHOLDS.functions}`,
  'test/',
], { cwd: root, stdio: 'inherit' })

if (result.error !== undefined) {
  console.error(`coverage run failed to start: ${result.error.message}`)
  process.exit(1)
}
if (result.signal !== null) {
  console.error(`coverage run killed by ${result.signal}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
