# FAQ

[English](faq.md) · [简体中文](zh/faq.md)

**The settings page has no Provider Studio**

1. Make sure it was installed into the profile you actually run: `dsh plugin --profile desktop why dsh-provider-studio`.
2. Quit DSH completely and start it again — refreshing the window is not enough.
3. Check the profile's `cordis.patch.yml` for `- id: dsh-provider-studio` together with `disabled: true` (another tool may have disabled it); remove that, then restart.

**The settings page is blank / `Failed to load plugins`**

Usually the plugin row in the profile and the `client.js` on disk are out of step (renamed package, half-finished update), or a plugin throws while loading. Restart first; if that does not help, remove and re-add the package.

**Test returns 404 or `transport failure`**

The Host process is still the old one. Restart DSH; the UI shows this hint too.

**The key shows as empty**

The provider's key comes from an environment variable (`$SOME_API_KEY`) and the credentials service has no value for it; the plugin never fabricates plaintext. Paste a new key here to override it.

**Test or Discover returns `PROBE_REDIRECT`**

The endpoint redirected the request to another origin (a gateway 302 to a third-party domain, for example). The plugin follows redirects only within the **same origin** and refuses cross-origin ones, so an API key — `x-api-key` in particular — is never forwarded to another host. Point the Base URL at the final address instead.

**The official Models page is gone**

Expected: see [Design](design.md#relationship-with-the-official-models-page). One line in `cordis.patch.yml` brings it back.

**Install prints `[WARN] Issues with peer dependencies found` / `missing peer @deepseek-ai/cordis`**

Harmless and can be ignored. `@deepseek-ai/cordis` is the runtime DSH itself provides and is not in the profile's `node_modules`, so pnpm cannot see it; DSH resolves the same copy at start, exactly as its own bundles do. The install completes normally (`+ dsh-provider-studio 1.3.1`).

**Save fails with `SETTINGS_CONFLICT`**

The configuration changed on disk between the page's read and the save (another window, an editor, another plugin). Click **Reload** to re-read and apply the change again.

**A save reports that it was not written to disk**

The Host wrote through `settings.replace()` and then re-read the document to check, but the change was not there, so the page refuses to report success. Check the DSH log for the write failure, reload, and retry; the profile's `cordis.patch.yml` remains the source of truth.
