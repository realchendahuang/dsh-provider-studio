/**
 * dsh-provider-studio — test-directory entry (compatibility shim).
 *
 * README: the project's documented commands are `npm test` / `node --test test/`
 * (package.json `scripts.test`, CI workflow). Node 22.23 no longer expands a
 * positional *directory* argument — it resolves `test/` like a module path, so
 * without this file `node --test test/` dies with `MODULE_NOT_FOUND` before any
 * test runs. Node reaches this file in two ways:
 *
 *  - handed the directory itself: `argv[1]` is `.../test`, so we re-export the
 *    real suite;
 *  - discovered as a file during bare `node --test`: `argv[1]` is `.../index.js`,
 *    so we stay inert and the suite runs exactly once from host.test.mjs.
 *
 * That keeps every invocation (`node --test`, `node --test test/`, `npm test`,
 * `node --test test/host.test.mjs`) at the same single 42-test run.
 */

const entry = process.argv[1] ?? ''
if (!entry.endsWith('index.js')) {
  await import('./host.test.mjs')
}
