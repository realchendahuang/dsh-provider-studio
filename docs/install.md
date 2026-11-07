# Installation

[English](install.md) · [简体中文](zh/install.md)

## Requirements

- DSH desktop or web, `0.2.2-rc.1` or later. `engines.dsh` is `>=0.2.2-rc.1 <0.3.0-0` because brand logos are served through DSH's `/plugins/.../assets/...` route and loaded with `require.asset`, both introduced in 0.2.2.
- On DSH 0.2.1 stay on `v1.2.4`, where logos are inlined into `client.js`.
- DSH isolates plugins per profile: the desktop app uses `desktop`, `dsh web` uses `web`. Match `--profile` to the profile you actually start.
- Installs run through pnpm (DSH ships its own). The repository contains a built `client.js`, so nothing is compiled at install time.

## Option A — desktop GUI

1. Sidebar → **Plugins** → **Add plugin**.
2. Paste the spec `github:realchendahuang/dsh-provider-studio#v1.3.1`. The `github:` shorthand and `https://github.com/realchendahuang/dsh-provider-studio#v1.3.1` are equivalent; a trailing `#<ref>` pins a tag or commit.
3. Leave **Install source** at its default. It only selects the npm registry used for package lookups and dependency downloads — the source code itself still comes from GitHub.
4. **Install**, then **Enable now**, then quit DSH completely and start it again.

The dialog runs the same `pluginManager.installBundle` path as the CLI; it adds the pre-install check, pnpm output, failure reasons, retry, and build-script approval.

Supported input forms in the dialog:

| Spec | Resolved as |
|---|---|
| `dsh-provider-studio` (with optional `@version`) | npm registry package |
| `github:owner/repo#v1.3.1`, `git+https://…`, `https://github.com/owner/repo` | Git repository |
| `/absolute/path/to/checkout` (also `file:` / `link:`) | local directory (relative paths are rejected) |
| `https://…/package.tgz` or `/absolute/path.tgz` | tarball |

## Option B — CLI from GitHub

```bash
dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.3.1
```

- `--profile` must match the profile you run: `desktop` for the desktop app, `web` for `dsh web`.
- Prefer the tag: `#v1.3.1` pins this release, `#<commit-sha>` pins a commit, and no ref follows `main`.
- pnpm clones the repository into the profile's `node_modules` and installs runtime dependencies (`yaml`, `@deepseek-ai/dsh-typert-protocol`). There is no `prepare` script, so nothing is built during install.

## Option C — clone locally (development)

```bash
git clone https://github.com/realchendahuang/dsh-provider-studio.git ~/code/dsh-provider-studio
dsh plugin --profile desktop add ~/code/dsh-provider-studio
```

The directory is linked (`link:`), not copied. `git pull` and source edits take effect after a DSH restart; run `npm run build:client` after changing `src/client/`.

## Verify

```bash
dsh plugin --profile desktop why dsh-provider-studio
```

Listing the package means both the dependency and the bundle patch are registered.

## Restart, do not refresh

A new or updated Host entry (`index.js`) only loads when DSH starts. Refreshing the window reloads `client.js` only, so quit DSH completely and start it again.

## Update

- **GitHub install:** remove and re-add with the new tag:

  ```bash
  dsh plugin --profile desktop remove dsh-provider-studio
  dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.3.1
  ```

- **Local link install:** `git pull`, rebuild when `src/client/` changed, restart DSH.

## Uninstall

```bash
dsh plugin --profile <profile> remove dsh-provider-studio
```

The official Models page returns after a restart.

## Version compatibility

`engines.dsh` is checked three times:

- **Before install** for registry names and local paths — an unsatisfied range fails before pnpm runs, so nothing is downloaded.
- **After fetch** for git and tarball specs — the profile manifest and lockfile are restored when the range is not satisfied.
- **At start** — a bundle whose range is not satisfied is skipped and reported in `skippedBundles`, unless an exact-version exemption exists.

Exemptions live in the profile's `compatibility.json` and are managed with:

```bash
dsh plugin --profile <profile> version-exemptions
dsh plugin --profile <profile> allow-version <package@version> --dsh-version <runtime> --accept-risk
dsh plugin --profile <profile> revoke-version <package@version> --dsh-version <runtime>
```

An exemption does not authorize dependency build scripts, and it is not inherited by a later plugin or DSH version.

## Install troubleshooting

**`[WARN] Issues with peer dependencies found` / `missing peer @deepseek-ai/cordis`** — harmless. `@deepseek-ai/cordis` is DSH's own runtime and is not in the profile's `node_modules`, so pnpm cannot see it; DSH resolves the same copy at start. The install completes normally (`+ dsh-provider-studio 1.3.1`).

**pnpm asks to approve build scripts** — DSH runs pnpm non-interactively, so dependency install scripts are blocked by default. Approve them in the dialog ("Allow these scripts and retry") only for packages you trust.

**GitHub is unreachable** — the dialog offers "Use a domestic mirror", but a registry mirror replaces npm packages only, not GitHub source. Clone locally and install the directory, or use the npm package once published.

**`already-installed`** — the package is already a profile dependency; remove it first.

**`not-a-bundle`** — the package declares no `dsh.bundle.patch`, so it cannot be installed as a plugin.

**`incompatible-version`** — the package's `engines.dsh` does not accept this DSH version; install a compatible version or add an exemption.
