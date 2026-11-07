# 开发与发布

[English](../development.md) | 简体中文

## 目录结构

```
index.js            Host 端入口：name / inject / apply 装配
lib/                Host 端模块：配置读写、凭据、探针、校验与错误码
contract.js         Host ↔ Client 契约：服务名、方法表、Typert 描述
src/client/         浏览器端源码（JSX）：views/ 页面、components/ UI 原语、hooks.js、templates/ 模板数据
client.js           浏览器端构建产物，随仓库提交（安装时直接加载）
cordis.patch.yml    bundle patch：插入本插件 + 隐藏官方 Models 页
icons/              品牌 logo 源文件（72 SVG + 112 个 48px WebP；构建期素材，不随包发布）
assets/icons/       随包发布的 logo（内容哈希命名，由 /plugins 资源路由按需加载）
docs/               截图与文档（随包发布：插件页的已安装详情按包内 README 渲染这些图片）
docs/zh/            中文文档（安装、使用、设计、常见问题、开发）
locale/             设置分区标题 / 描述的本地化
test/               Host 纯函数单测（node:test）
scripts/            构建、图标生成与发布门禁脚本
```

## 命令

```bash
npm ci                        # 按 package-lock 安装（首次 / CI；改依赖时用 npm install）
npm run check                 # 发布门禁：版本、files、patch、图标资源、client.js 一致性、体积预算
npm test                      # Host 单测（node:test）
npm run test:coverage         # 单测 + 覆盖率门禁（行 87 / 分支 82 / 函数 91）
npm run build:client          # src/client/ → dist/client.bundle.cjs → client.js
npm run gen:icons             # icons/ → assets/icons/（内容哈希）+ src/client/icons.js（key → 资源引用）
node scripts/gen-ui-icons.mjs # Lucide 字形 → src/client/ui-icons.jsx
python3 scripts/fetch-favicons.py  # 为缺 logo 的模板抓官网 favicon（需 Pillow）
```

- `client.js` 由 `scripts/build-client.mjs` 用 esbuild 打成 CJS，再包进 `window.__ModuleLoader__.load` 的 factory；React 由 DSH 的模块表提供，不打进 bundle。依赖版本由 `package-lock.json` 锁定；构建走临时文件 + rename，失败不会留下半个 `client.js`。
- `src/client/icons.js`、`src/client/ui-icons.jsx`、`dist/` 都是生成物，不要手改；`client.js` 是例外——它是需要提交的发布产物。
- 贡献者用 npm（仓库带 `package-lock.json`）；用户安装时由 DSH 用 pnpm 拉包，两条链路互不影响。
- `scripts/fetch-favicons.py` 读取本机的 `/tmp/providers.json` 与 `/tmp/models-dev.json` 缓存并写入 `icons/`，不是安装或构建的必需步骤。

## 门禁与测试

- `scripts/check.mjs` 不写盘：它调用 `build-client.mjs` 暴露的同一套 esbuild 配置在内存里重建 `client.js`，与提交产物逐字节比对。
- 同一步还检查：版本、`engines.dsh` 上界、`files` 白名单、`cordis.patch.yml`、模板 ↔ 图标孤儿、logo 资源存在与内容哈希、`node --check`、体积预算（client / icons / assets / docs），以及各文档的本地图片与安装 `#vX.Y.Z`。
- `--no-build` 可跳过重建比对（例如没装 `node_modules`），CI 里不允许使用。
- `npm run test:coverage` 用 Node 内置覆盖率跑单测，并在行 87% / 分支 82% / 函数 91% 处失败；只跑 `npm test` 没有覆盖率门槛。
- CI（`.github/workflows/check.yml`）矩阵：ubuntu-latest Node 22、24 + windows-latest Node 22；步骤是 `npm ci` → `npm run check` → `npm run test:coverage`。Windows 用来验证 `.gitattributes` 的 `eol=lf` 承诺和逐字节重建在非 POSIX 文件系统上同样成立。
- tag 推送守卫（`.github/workflows/tag.yml`）要求 tag 是 annotated、等于 `package.json` 的版本，且其提交在 `main` 上。

## 发布流程

发布走两段式脚本：tag 推到远端后不可重打，所以 `prepare` 只做本地可回退的部分。

```bash
node scripts/release.mjs prepare 1.3.2 --notes /tmp/notes.md
# 检查 git show --stat HEAD 与 tag 后：
node scripts/release.mjs publish          # 也可 --no-npm 跳过 npm
node scripts/release.mjs npm              # 只补发 npm（远端已有同名 tag 时）
```

- `prepare`：校验版本递增与工作区干净、插入 CHANGELOG、同步 `package.json` / `package-lock` 和各文档（README、docs）里的 `#vX.Y.Z`、跑门禁、commit 并打 annotated tag。
- `publish`：确认远端没有同名 tag、门禁重跑通过后原子推送 `main` 与 tag，等 CI 绿（按 `check.yml` 过滤，避免和同一提交上的 tag 守卫混淆）再用 CHANGELOG 段落建 GitHub Release，最后把同名版本发到 npm（需要 `npm login`，且 `package.json` 不能有 `private`）。工作区不干净、远端没有同名 tag 或版本已发过会被拒绝 / 跳过。
- GitHub Release 的标题固定为 tag 本身（`vX.Y.Z`），正文来自 CHANGELOG 对应段落；`--title` 只给 git tag 加说明。
- tag 必须是 annotated 且与 `package.json` 版本一致，见「门禁与测试」里的 tag 守卫。

## 图标流水线

- `icons/` 只是构建期素材，不随包发布。
- `node scripts/gen-icons.mjs` 把每个 logo 复制成 `assets/icons/<key>.<sha1-12>.<ext>`（内容哈希命名，资源路由对它们返回 `immutable` 缓存），并生成只含 key → `require.asset("plugins/<包名>/assets/icons/<file>")` 的 `src/client/icons.js`；`client.js` 里不再内联 logo。
- `package.json` 的 `"./assets/*": "./assets/*"` 导出是资源路由解析文件的前提，`files` 白名单必须同时包含 `assets/`；缺任一条，资源路由都会 404。
- PNG 已统一转成 48px WebP（原 PNG 见 git 历史）。新增 favicon 要先转 WebP，再跑 `npm run gen:icons`。
- 换格式或批量新增图标后先测量，再生成：`python3 scripts/icon-frames.py`（透明留白 → 光学缩放）和 `python3 scripts/icon-tones.py`（明暗分类 → 浅 / 深底板）。两个脚本需要 Pillow。
- 新增供应商 logo：优先用官方站点的苹果触控图标 / SVG，再跑 `python3 scripts/fetch-favicons.py`（会自动跳过本地与内网地址、裁掉透明留白）；缺图标的模板回退首字母。
- 门禁会检查 logo 文件名里的内容哈希与文件字节一致、没有孤儿资源、模板 ↔ 图标对应关系，以及 assets 体积预算。

## 贡献

- PR 前跑 `npm run check` 与 `npm test`。
- 改了 `src/client/` 就把重新生成的 `client.js` 一起提交——插件安装时直接加载它。
- Host 端改动（`index.js` / `contract.js` / `lib/`）必须重启 DSH 才能验证；只改客户端刷新窗口即可。
- 提交信息用英文祈使句，例如 `Fix key reveal when the secret is empty`。
- 版本变化记录在 [CHANGELOG.md](../../CHANGELOG.md)。
- 动手前先读[设计](design.md)的「实现要点」。
