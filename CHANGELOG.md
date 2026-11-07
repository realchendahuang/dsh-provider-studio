# Changelog

## 1.2.3 — 2026-11-07

安装包补上 `docs/`（插件页详情里 README 截图不再 404）、安装警告说明，以及 CI 与门禁维护。

- **`files` 补 `docs/`**：DSH 插件页的已安装详情由 `dsh-plugin-detail` 读取**包内** README，相对截图按包目录解析；`docs/` 不随包发布时详情页会整片图裂。官方组合包同样把 `docs` 放进 `files`
- **门禁加两条**：README 里的本地图片必须落在 `files` 白名单内；README 安装命令的 `#vX.Y.Z` 必须等于 `package.json` 版本（v1.2.1 / v1.2.2 的 tag 引用过期就是没有这条检查）
- **README**：FAQ 补 pnpm `missing peer @deepseek-ai/cordis` 警告说明（cordis 由 DSH 本体提供，可忽略）；开发文件表补 `docs/`
- **CI**：`actions/checkout`、`actions/setup-node` 从 v4 升到 v7（v4 已触发 Node 20 弃用提示，v7 仍支持 `node-version: 22` 与 `cache: npm`）

## 1.2.2 — 2026-11-06

补齐供应商 logo：把没有图标的模板按官网逐个找了一遍，新增 35 个真实品牌标；顺带为 Magpie 这类本地网关加上了官网图标。

- **新增 35 个 logo**（全部来自官方站点）：`amd`、`scaleway`、`sarvam`、`modal`、`helicone`、`requesty`、`bothub`、`privatemode-ai`、`neuralwatt`、`tokengo`、`berget`、`mixlayer`、`moark`、`neosmith`、`boundless`、`echo`、`cloudferro-sherlock`、`agentrouter`、`ambient`、`ai-router`、`ainetcafe`、`crossmodel`、`daoxe`、`dinference`、`hpc-ai`、`llmtech`、`lucidquery`、`modelis`、`tempr`、`tokenrouter`、`unorouter`、`vancine`、`vivgrid`、`zeldoc` 等，对应模板同步加上 `icon`
- **Magpie**：确认官网是 [usemagpie.ai](https://usemagpie.ai)，用官方 256px 图标生成 `magpie.webp`，并在 `iconForProvider` 加规则，`magpie` / `magpie-responses` 这类本地网关行不再显示首字母
- **抓取脚本更可靠**：不再要求 models.dev 缓存（缺缓存时直接用模板里的 baseURL）；支持 `data:` 图标；接受单色与 16px favicon；拒绝空白占位、拒绝 loopback/内网地址；抓错站点或抓到营销横幅的（AMD 首页 og-image、待售域名、GoDaddy 占位图标等）人工复核后剔除
- **门禁**：`check.mjs` 把 `iconForProvider` 的规则也算作图标引用，Magpie 这类无模板图标不再误报孤儿；体积预算按新增 logo 上调（client 640 KB / icons 340 KB）
- 仍有 17 个模板没有可靠官网图标（站点 403/超时/域名待售或只有 16px 占位），继续走首字母兜底
- **发版配套校正**：README 的安装命令固定到 `v1.2.2`，模板 / logo 数字按实测更新（218 个模板、184 个内联 logo）；`@deepseek-ai/dsh-typert-protocol` 依赖范围补上 `^0.2.2-rc.1`（两份实现字节相同，0.2.2 环境下不再多装一份），cordis peer 放宽为 `>=4.0.5 <5.0.0`；README 注明插件面向 web / desktop profile

## 1.2.1 — 2026-11-05

深色模式下那一套图标收口：不再有固定浅灰的单色 logo、不再有被同色面板吃掉的品牌标，尺寸参差的 favicon 也统一了光学大小。

- **单色 logo 跟随主题**：`commandcode`、`ollama`、`openai`、`opencode`、`xai` 等 29 个 SVG 原本写死 `#5b6070`，深色面板上灰到几乎看不见；现在用 CSS mask + 主题次级文字色渲染，亮/暗两套主题都清晰
- **位图 logo 按明暗分类**：按可见像素的对比度把 57 个位图分成「近黑」「近白」「自带方底」三类——近黑的在深色主题下垫浅色底板，近白的在浅色主题下垫深色底板，自带不透明方底的 17 个 app-icon 型 logo 改画 1px 内描边，避免同色背景吃掉边界
- **主题实时跟随**：从 `.dpp-root` 的计算色推导 `data-dpp-scheme`，切换主题后底板跟着切换（观察 DOM 属性 + 系统外观，另加低速可见性轮询兜底）
- **光学尺寸归一**：44 个 favicon 有过多透明留白，最小时只占画布 46%；新增 `scripts/icon-frames.py` 量出内容外框，客户端用 CSS 缩放补齐，logo 不再忽大忽小，资源本身不重新烘焙、不涨包
- **无 logo 的供应商改用首字母**：灰色包裹占位符换成品牌首字母 monogram，不再一排都是一样的方块
- **资源修正**：补上 meganova 的真实 favicon（原图最大不透明度只有 184/255，几乎看不见）；移除误抓成 GitHub octocat 的 lynkr logo（本地端点没有公开 logo，改走 monogram）；删掉两个没有任何模板引用的孤儿图标
- `scripts/fetch-favicons.py` 跳过 loopback / 内网地址（避免把别人的 favicon 当成本地供应商的），保存时裁掉透明留白，并提示跑 `icon-tones.py`

## 1.2.0 — 2026-11-05

收口的一版：把密钥和凭据的边界收紧，失败有稳定的错误码，界面补齐 i18n 与可访问性，Host/Client 拆成可维护的模块，图标换成 WebP 瘦身，并第一次有了发布门禁。

- **草稿探测不再借用已存密钥**：`testModel` / `discoverModels` 删掉 `apiKeyEnv` 参数，只给 Base URL 的草稿只能使用调用方粘贴的 `apiKey`，Host 不再为草稿解析任何已存凭据
- **密钥按需读取**：新增 `revealKey({ route })`，只有用户点「显示 / 复制」时才向凭据服务取明文；`getProvider` 不再随供应商详情返回 `secret`，读取路径与展示路径分开，旧客户端仍可回落
- **写路径加固**：`route` 拒绝 `__proto__` / `prototype` / `constructor`，内部字典改 `Object.create(null)` + `Object.hasOwn`；`saveProvider` / `createProvider` 共用同一套 api / baseURL / models 校验；写入带 `revision`，并发冲突返回 `SETTINGS_CONFLICT` 而不是静默覆盖
- **修好三个静默缺陷**：导出的内置 DeepSeek 包名改为真实的 `@deepseek-ai/dsh-llm-deepseek-api-key`（原来贴回 patch 静默无效）；内置 DeepSeek 的测试走 `anthropic-messages` + `{base}/v1/messages` + `x-api-key`，拉取走官方 `https://api.deepseek.com/models`；日志改用 `ctx.logger.warn`（`ctx.get('logger')` 永远拿不到服务，之前的 warn 被丢弃）
- **失败统一错误码**：所有失败返回 `{ ok: false, code, message, params?, detail? }`，码表 28 个（`INVALID_BASE_URL`、`SETTINGS_CONFLICT`、`PROBE_HTTP`…），客户端另有 `REMOTE_UNAVAILABLE`；客户端按 `err.<CODE>` 渲染中英文案，未知码退回 Host 文案，`params` 支持 `{label}` / `{status}` 插值
- **中英文自动切换**：订阅 locale 快照，语言切换后组件实时重渲染；补齐组件、模板中文名与协议名等硬编码串，英文界面不再夹中文
- **可访问性**：模型弹窗加 Tab focus trap、打开聚焦、关闭还焦，`ActionMenu` / `SelectMenu` 补 `aria-activedescendant` 与焦点进入，API Key 输入框补可访问名字，小字对比度提到 ≥4.5:1
- **未保存修改拦截扩到关闭窗口**：除返回列表外，关闭窗口 / 卸载设置分区也会拦；保存成功后的读回失败不再误报「保存失败」；确认框动作抛错会提示而不是吞掉
- **图标瘦身**：79 个 PNG logo 转 48×48 WebP（显示尺寸 24px 的 2x），`src/client/icons.js` 从 350 KB 降到约 230 KB，`client.js` 从 618 KB 降到约 500 KB，152 个 logo 全部保留；新增 600 KB 的体积预算，超了门禁就失败
- **Host 拆分**：`index.js` 从 1254 行收到 48 行，只留 `name` / `inject` / `apply` 装配；按职责拆成 `lib/` 12 个模块（settings、credentials、probe、validate、errors、models、routes、views、service、profile、vocabulary、util），并对纯函数补了 `node:test` 单测
- **Client 拆分**：`app.jsx`（2939 行）拆成 views / components / hooks / lib，`templates.js` 拆成 `templates/`，每个文件回到可读规模；删除死字段与重复项，清洗模板里的占位 URL
- **构建脚本加固**：`scripts/build-client.mjs` 改原子写（临时文件 + rename，失败不留半个产物）、打印 esbuild 版本、失败给可执行提示，并暴露内存构建入口供门禁复用
- **发布门禁**：新增 `scripts/check.mjs`（零新依赖）——版本三处一致、`engines.dsh` 有上界、`files` 白名单与 exports 覆盖、`cordis.patch.yml` 可解析、模板↔图标孤儿、内存重建 `client.js` 逐字节比对、`node --check`、体积预算；失败退出码 1
- **发布元数据**：`version` 1.2.0，`engines.dsh` 收紧为 `>=0.2.1-rc.5 <0.3.0-0`，`files` 补 `lib/` 与 `THIRD_PARTY_NOTICES.md`，`scripts` 增加 `check` / `test` / `gen:icons`
- **许可与仓库卫生**：新增 `THIRD_PARTY_NOTICES.md`（lobe-icons MIT、Lucide ISC、models.dev MIT + 商标归属）与 `.gitattributes`（`client.js` 标为生成物、跳过 diff；`.webp` 标 binary；统一 LF）
- **CI**：新增 `.github/workflows/check.yml`（node 22 + `npm ci` + `npm run check` + `node --test test/`）
- **文档**：README 修掉 Anthropic 协议路径漏改的 `/messages`（正确是 `/v1/messages`），安装命令建议带 `#v1.2.0` tag，补开发/门禁/图标策略说明与新的已知限制

## 1.1.2 — 2026-11-05

把两个会说谎的探针修好，新建流程去掉「自己查 model id」，配置可以带走了。

- **测试与拉取按真实请求拼装**：Anthropic 协议此前请求 `{baseURL}/messages` 与 `{baseURL}/models`，正确是 `{baseURL}/v1/messages` 和 `{root}/v1/models`（对齐 `dsh-llm-pi-ai` 的 `listingUrl` 与 Anthropic SDK 的 `/v1/messages`）
- **探针带上「请求设置 → 请求头」**：需要额外鉴权头的网关（Azure 的 `api-key`、部分中转的 `x-api-key`）不会再被误报失败
- **新建时直接「读取模型」**：填好 Base URL 与密钥就能问端点要列表，从下拉里选首个模型；读不到时仍可手填
- **供应商 `…` 菜单新增「复制配置」**：按 patch 文档导出整条 YAML，可直接贴进 `cordis.patch.yml`；不含密钥明文，内置 DeepSeek 行同样可导出
- **修正 Anthropic 协议模板的 Base URL**：8 个模板多带了 `/v1`，会和客户端补的 `/v1/messages` 叠成 `/v1/v1/messages`。旧模板多带 `/v1`、旧探针少带 `/v1`，两者恰好抵消——这也是「测试通过、真实对话 404」一直没被发现的原因。详情页遇到 `…/v1` 结尾会给出提示
- 模板分组标题走 i18n，英文界面不再出现「常用 / 国内厂商」
- 清掉 `listProviders` 返回给客户端的调试字段，以及每次创建供应商都会打的日志

## 1.1.1 — 2026-11-05

收一轮毛刺：间距、套皮文案、内置行的小动作。

- 模型弹窗恢复垂直节奏：表单块、输入模态、「高级」区之间原来零间距贴在一起，现在统一 14px，「高级」面板内部 12px
- 内置 DeepSeek 不再给「重命名」入口（`llm-deepseek` 没有 `displayName` 字段，改了也存不下去），行内名称跟随界面语言
- 协议名、弹窗关闭按钮、确认框「取消」、渲染失败兜底的文案改走 i18n，英文界面不再夹中文
- 删掉上一版遗留的四条死样式

## 1.1.0 — 2026-11-04

把 `llm-pi-ai` 的参数面补全，并按归属分层：模型的东西在模型里，供应商的东西在供应商页里。

- 模型弹窗新增「高级」区（模型自己的参数）：
  - **思考等级**（`reasoningEfforts`）：继承内置目录 / 不支持思考 / 自定义等级；自定义时逐条编辑「等级 → 发送值」，`off` 可留空，添加等级按升级顺序补齐，非法组合保存前拦下
  - **兼容开关**（`compat`）：按协议列出可覆盖项（OpenAI 兼容 19 项、Responses 4 项、Anthropic 7 项），开关与枚举下拉，默认全部继承自动检测
- 供应商详情新增「请求设置」（供应商自己的参数）：请求头、传输方式、缓存保留、请求 / 流空闲 / WebSocket 超时、重试策略与次数、图片预算；折叠时显示已覆盖项数量
- 内置 DeepSeek 行保留自己的高级区：思考模式、推理等级、输出上限、流空闲超时、重试策略
- Host 端按 pi-ai schema 校验后再落盘（枚举、正整数、协议允许的 compat 字段、`retryPolicy.mode`）；换协议时自动丢弃新协议不支持的开关；界面不管理的字段不会被清空
- 下拉面板改为视口定位（fixed），在可滚动的弹窗里不再被裁切；长选项列表内部滚动不会把菜单关掉
- 同步更新 README 参数分层说明与预览截图

## 1.0.0 — 2026-11-04

首个公开版本。

- 接管官方 Models 设置页：另开「供应商管理」，直接读写 `llm-pi-ai.providers` 与 DSH 凭据服务
- 一级供应商列表、二级详情页；标题可就地改名，`…` 菜单提供重命名与删除
- API Key 显示、复制、更换、清除（清除前有确认弹窗），密钥状态一目了然
- 模型增删改、真实连通性测试（返回延迟或具体 HTTP 错误）、从端点拉取模型
- 223 个供应商模板（models.dev）与品牌 logo（lobe-icons / 官网 favicon）
- 内置 DeepSeek 行可编辑不可删；官方 Models 页由 bundle patch 隐藏，可一行配置恢复
- Lucide 图标、统一的入场/弹窗/下拉/Toast 动效，深色与浅色主题
- 未保存修改提示与离开拦截，`Cmd/Ctrl+S` 保存，保存结果以 Toast 呈现
