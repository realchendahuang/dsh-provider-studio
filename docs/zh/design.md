# 设计

[English](../design.md) | 简体中文

## 与官方 Models 设置页的关系

`cordis.patch.yml` 除了插入本插件，还带一行：

```yaml
- id: ui-settings-models
  disabled: true
```

效果是设置面板里不再出现官方「Models」页，只剩本插件的「供应商管理」。这是 patch 层覆盖，不是删除包：

- 想同时保留官方页：把 `disabled: true` 改成 `false`（或删掉这两行），重启 DSH；
- 卸载本插件同样会恢复官方页；
- 只禁用这一个 package。`llm-pi-ai` / `llm-deepseek`（模型适配器）、`ui-model-selection`（composer 里的模型选择器）、`credentials` 相关（密钥服务）**不要**禁用。

代价：官方 Models 页里的「DeepSeek 账号登录」入口、以及官方对内置 `llm-deepseek` 供应商的编辑入口会一并消失；内置 DeepSeek 的密钥 / Base URL / 模型表改由本插件编辑。

## 实现要点

- **读取时直接解析 profile patch 文档原文**，而不是 `settings.describe()` 的 schema 投影：投影会丢掉 schema 未声明的字段（每个模型的 `reasoningEfforts` 档位、`compat` 等），保存时就会悄悄丢失。
- **写入并校验**：优先走 `settings.replace()`（没有 replace 时退回 update），写完再读回文档校验是否真的落盘；界面会显示「保存未落盘」而不是假装成功。
- **密钥不落插件**：权威副本始终在 DSH 凭据服务，插件只通过 `credentials` 服务读写；明文只在用户点「显示 / 复制」时经 `revealKey({ route })` 取回，不随供应商详情返回。
- **稳定错误码**：失败统一走 `{ ok: false, code, message, params?, detail? }`，`code` 是稳定机器码（如 `INVALID_BASE_URL`、`SETTINGS_CONFLICT`、`PROBE_HTTP`、`PROBE_REDIRECT`），客户端按 `err.<CODE>` 本地化，未知码退回 Host 的 `message`；`params` 用于 `{label}` / `{status}` 这类插值。
- **高级参数逐字段校验**：走 `saveProvider` 的 `patch.advanced`，Host 端按 pi-ai 的 schema 逐字段校验后再写（思考等级枚举、协议允许的 `compat` 字段、正整数范围），宁可报错也不写坏配置；客户端与 Host 各存一份同一套常量。
- **只走 Typert Remote**：Host ↔ Client 走 `providerPanel` 服务，不注册全局 HTTP 路由。
- **没有遥测**：除用户主动触发的「测试」「拉取模型」会请求所配置的供应商端点外，插件不发起外部网络请求。

## 已知限制

- Host 端改动必须重启 DSH 才生效（见[安装](install.md)）。
- 面向 `web` / `desktop` profile（要替换官方 Models 设置页）；在 headless 等没有 `ui-settings-models` 行的 profile 里启动会多一条无害的 patch 警告（`entry "ui-settings-models" not found`），不影响运行。
- 只管理 `llm-pi-ai` 的供应商（外加内置 `llm-deepseek`）；不支持需要专用 SDK 的协议。
- 新建供应商至少要有一个模型条目。删除供应商、清除密钥、放弃未保存修改都会先弹出二次确认。
- 路由级兜底字段（`defaultContextWindow`、`defaultMaxTokens`、`defaultInput`、`reasoning`、`thinkingBudgets`）和 `modelOverrides` 没有界面，需要时手写 `cordis.patch.yml`；日常配置用模型自己的字段就够。
- 模板与模型 ID 只是预填建议，不代表账户一定有权限调用。
- 「复制配置」只导出单个供应商、且不含密钥；整份 profile 的配置仍以 `cordis.patch.yml` 为准。
- `engines.dsh` 锁在 `>=0.2.2-rc.1 <0.3.0-0`：logo 资源路由从 0.2.2 起才有；插件依赖 DSH 内部的 settings / credentials / Typert Remote 形态，DSH 0.3 发布后需要先发一版适配，上界不会被静默放宽。

## 数据来源与致谢

- [models.dev](https://github.com/sst/models-dev)（MIT）：供应商目录数据（名称、API root、环境变量名、协议映射）。
- [lobe-icons](https://github.com/lobehub/lobe-icons)（MIT）：品牌 logo；lobe-icons 未收录的由 `scripts/fetch-favicons.py` 从其官网或文档站抓取 favicon。
- [Lucide](https://lucide.dev)（ISC）：界面图标（由 `scripts/gen-ui-icons.mjs` 烘焙进 `src/client/ui-icons.jsx`）。
- [ZCode](https://github.com/zai-org/zcode)（Apache-2.0）：设置页的交互与信息结构参考；未复制其源代码或素材。
- 页面里出现的品牌名称与 logo，商标和版权归各厂商所有。
- 上述素材的许可全文与商标归属见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。
