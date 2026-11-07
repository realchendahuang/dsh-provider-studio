# Design

[English](design.md) · [简体中文](zh/design.md)

## Relationship with the official Models page

The bundle patch does two things: it inserts this plugin and it disables one row:

```yaml
- id: ui-settings-models
  disabled: true
```

The effect is that Settings no longer shows the official **Models** page and shows **Providers** instead. This is a patch-layer override, not a removed package:

- to keep both pages, set `disabled: false` (or delete those two lines) and restart DSH;
- uninstalling the plugin restores the official page as well;
- only that one row is disabled. Leave the model adapters (`llm-pi-ai`, `llm-deepseek`), the composer's model selector (`ui-model-selection`) and the credentials service alone.

The cost: the official page's DeepSeek account sign-in entry, and the official editor for the built-in `llm-deepseek` provider, disappear with it. The built-in DeepSeek provider's key, Base URL and model table are edited in this plugin instead.

## How it works

- **Reads the raw patch document.** The page parses the configured patch text instead of `settings.describe()`'s schema projection, because the projection drops fields the schema does not declare — every model's `reasoningEfforts` tiers, `compat` switches and so on — and saving it would silently lose them.
- **Writes and verifies.** Writes go through `settings.replace()` (falling back to update when unavailable) and the document is read back afterwards to check that it really reached disk. A write that did not land is reported as such instead of reported as success.
- **Keys stay in the credentials service.** The plugin never stores key material: it reads and writes through the `credentials` service, and plaintext is fetched on demand via `revealKey({ route })` only when the user clicks show or copy. Provider details no longer carry the key.
- **Stable error codes.** Every Host failure is `{ ok: false, code, message, params?, detail? }`, where `code` is a stable machine string (`INVALID_BASE_URL`, `SETTINGS_CONFLICT`, `PROBE_HTTP`, `PROBE_REDIRECT`, …). The client localizes `err.<CODE>` and falls back to the Host's `message`; `params` fills placeholders such as `{label}` / `{status}`.
- **Advanced parameters are validated field by field.** `saveProvider` validates `patch.advanced` against pi-ai's schema (reasoning tier enums, protocol-permitted `compat` fields, positive-integer ranges) and refuses invalid values rather than writing a broken configuration.
- **Typert Remote only.** Host and client talk over the `providerPanel` Remote service; the plugin registers no global HTTP routes.
- **No telemetry.** Apart from the user-triggered Test and Discover requests to the configured provider endpoint, the plugin makes no outbound network requests.

## Known limitations

- Host-side changes require a DSH restart; refreshing the window only reloads `client.js`.
- The plugin targets `web` and `desktop` profiles. On a profile without the `ui-settings-models` row (headless, for example) it logs one harmless patch warning (`entry "ui-settings-models" not found`) and keeps running.
- Only `llm-pi-ai` providers are managed, plus the built-in `llm-deepseek`; protocols that need a dedicated SDK are unsupported.
- A provider needs at least one model. Deleting a provider, clearing a key and discarding unsaved edits all ask for confirmation.
- Route-level fallback fields (`defaultContextWindow`, `defaultMaxTokens`, `defaultInput`, `reasoning`, `thinkingBudgets`) and `modelOverrides` have no UI.
- Templates and model IDs are suggestions only; they do not mean the account is allowed to call them.
- **Copy config** exports a single provider without key material; the profile's `cordis.patch.yml` is still the source of truth.
- `engines.dsh` is pinned to `>=0.2.2-rc.1 <0.3.0-0`: the assets route arrived in 0.2.2, and DSH 0.3 will need a deliberate compatibility release rather than being silently admitted.

## Credits

- [models.dev](https://github.com/sst/models-dev) (MIT) — provider catalog data: names, API roots, environment variables, protocol mapping.
- [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT) — brand logos; icons missing there were fetched from the vendor's site by `scripts/fetch-favicons.py`.
- [Lucide](https://lucide.dev) (ISC) — UI icons, baked into `src/client/ui-icons.jsx` by `scripts/gen-ui-icons.mjs`.
- [ZCode](https://github.com/zai-org/zcode) (Apache-2.0) — reference for the settings page's interaction and information structure; no source code or assets were copied.
- Brand names and logos belong to their respective owners; license texts and trademark notes are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
