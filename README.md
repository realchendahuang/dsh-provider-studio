# dsh-provider-studio

[English](README.md) · [简体中文](README.zh.md)

A provider manager for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It replaces the built-in **Models** settings page and edits the `llm-pi-ai` provider configuration directly: browse providers, reveal or replace API keys, manage models and their advanced parameters, test connectivity, and pull the model list from an endpoint — without hand-editing `cordis.patch.yml`.

[![DSH](https://img.shields.io/badge/DSH-0.2.2--rc.1%2B-0f1115)](docs/install.md#requirements)
[![Version](https://img.shields.io/github/package-json/v/realchendahuang/dsh-provider-studio?label=version)](https://github.com/realchendahuang/dsh-provider-studio/releases)
[![CI](https://github.com/realchendahuang/dsh-provider-studio/actions/workflows/check.yml/badge.svg)](https://github.com/realchendahuang/dsh-provider-studio/actions/workflows/check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/realchendahuang/dsh-provider-studio?style=social)](https://github.com/realchendahuang/dsh-provider-studio/stargazers)
[![Issues](https://img.shields.io/github/issues/realchendahuang/dsh-provider-studio)](https://github.com/realchendahuang/dsh-provider-studio/issues)

![Provider detail page](docs/detail.webp)

## Why this plugin

The built-in Models page only sees what the settings schema projects: fields the schema does not declare are dropped on save, and an API key can be written but never read back. This plugin reads the raw `llm-pi-ai` patch document and edits it in place, so:

- **Keys are readable.** Masked by default; reveal, copy, replace or clear one in place. The authoritative copy never leaves DSH's credentials service.
- **Advanced parameters survive.** Per-model `reasoningEfforts` and `compat`, per-provider `headers`, transport and retry settings, image budgets — all editable, none silently lost on save.
- **Everything per provider on one page.** Display name, protocol, Base URL, key, models, connectivity tests and batch model discovery.
- **Probes match real requests.** Test and Discover call the same path with the same custom headers DSH uses, so a probe that passes here passes in a session.
- **218 provider templates.** Prefilled from models.dev, 201 with a shipped brand logo; the rest fall back to initials.
- **Config you can take with you.** Export a single provider as paste-ready YAML — credential names only, never key material.
- **Reversible.** One line in the bundle patch hides the official Models page; flip it back or uninstall and it returns.

## Quick start

Requires DSH 0.2.2-rc.1 or later on a `desktop` or `web` profile.

```bash
dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.3.1
```

Or from the desktop GUI: **Plugins → Add plugin**, paste
`github:realchendahuang/dsh-provider-studio#v1.3.1`, install, then quit and restart DSH.

Settings → **Providers** appears (the plugin list calls it *Provider Studio*), and the official Models page is replaced.

## Documentation

| Document | What it covers |
|---|---|
| [Installation](docs/install.md) | GUI and CLI install, profiles, updating, uninstalling, version compatibility |
| [Usage](docs/usage.md) | Every screen, parameter and shortcut, with screenshots |
| [Design](docs/design.md) | Why the official page is replaced, how it works, known limitations |
| [FAQ](docs/faq.md) | Blank settings page, 404 probes, empty keys, peer dependency warnings |
| [Development](docs/development.md) | Build, gate, tests, release flow, icon pipeline |

Chinese: [安装](docs/zh/install.md) · [使用](docs/zh/usage.md) · [设计](docs/zh/design.md) · [常见问题](docs/zh/faq.md) · [开发](docs/zh/development.md)

## Screenshots

| | |
|:---:|:---:|
| ![Provider list](docs/list.webp)<br>The provider list | ![Model dialog](docs/model-dialog.webp)<br>Model editing, with per-model advanced parameters |

The [usage guide](docs/usage.md) has the rest.

## Star history

[![Star History Chart](https://api.star-history.com/svg?repos=realchendahuang/dsh-provider-studio&type=Date)](https://star-history.com/#realchendahuang/dsh-provider-studio&Date)

## Contributing

Issues and pull requests are welcome. Run `npm run check` and `npm test` before opening a PR; see [development](docs/development.md).

## License

[MIT](LICENSE) © 2026 dsh-provider-studio contributors. Third-party assets and trademarks are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
