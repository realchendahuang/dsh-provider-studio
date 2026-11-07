# 安装

[English](../install.md) | 简体中文

## 环境要求

- DSH 桌面版或 `dsh web`，0.2.x。`engines.dsh` 为 `>=0.2.2-rc.1 <0.3.0-0`，按 `0.2.2-rc.1` 实测。
- 品牌 logo 走 DSH 的 `/plugins/<包>/assets/` 资源路由，并通过 `require.asset` 加载；两者从 0.2.2 才有，0.2.1 及更早版本停留在 v1.2.4（logo 内联在 `client.js`）。
- `dsh` CLI 已在 PATH 中。包内带有构建好的 `client.js`，安装阶段不编译。
- DSH 按 profile 隔离插件：桌面版用 `desktop`，`dsh web` 用 `web`。命令里的 `--profile` 必须和实际启动的 profile 一致。
- `engines.dsh` 上界锁在 `<0.3.0-0`：DSH 0.3 发布后需要先发适配版本，不会被静默放行。

## 方式一：桌面端图形界面

1. 侧栏「插件」→ 右上「添加插件」。
2. 粘贴 `github:realchendahuang/dsh-provider-studio#v1.3.1`（或 `https://github.com/realchendahuang/dsh-provider-studio#v1.3.1`），两者等价。
3. 「安装源」保持默认 →「安装」→ 装完点「立即启用」→ 完整退出并重启 DSH。

`#v1.3.1` 固定到本次发布；去掉 ref 就跟随 `main` 的最新提交。

- 图形界面与 CLI 是同一套 `pluginManager.installBundle` 逻辑，界面多了安装前预检、pnpm 进度、失败原因与重试，以及 pnpm 拦下构建脚本时的「允许这些脚本并重试」。
- 「安装源」只决定 npm 注册表（包名查询与依赖下载）；Git 代码本身仍从 GitHub 拉。
- GitHub 连不上时界面提示「改用国内镜像」，但镜像只顶 npm 包，顶不了 GitHub 源码。

## 方式二：GitHub 命令

```bash
dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.3.1
```

- 完整地址等价：`git+https://github.com/realchendahuang/dsh-provider-studio.git#v1.3.1`。
- `#v1.3.1` 固定本次发布，`#<commit-sha>` 固定提交；不带 ref 跟随 `main`，可能拿到未发布的改动。
- pnpm 把仓库拉进 profile 的 `node_modules`，并安装运行依赖 `yaml`、`@deepseek-ai/dsh-typert-protocol`。没有 `prepare` 脚本，安装过程不编译任何东西。
- `desktop` 换成实际启动的 profile（如 `web`）。

## 方式三：本地克隆（开发）

```bash
git clone https://github.com/realchendahuang/dsh-provider-studio.git ~/code/dsh-provider-studio
dsh plugin --profile desktop add ~/code/dsh-provider-studio
```

- 本地目录以 pnpm `link:` 依赖写入 profile，不复制文件；之后 `git pull`、改源码都不需要重新 `add`。
- 改了 `src/client/` 要构建后再重启：

```bash
cd ~/code/dsh-provider-studio
npm install            # 改依赖或首次开发时才需要
npm run build:client   # 改了 src/client/ 时才需要
```

- Host 端 `index.js` / `contract.js` 是手写 ESM，无需构建。
- 改动在完整重启 DSH 后生效。

## 确认装上了

```bash
dsh plugin --profile desktop why dsh-provider-studio
```

能列出这个包说明依赖和 bundle patch 都注册了。重启 DSH 后，设置里应出现「供应商管理」，官方「Models」页消失。

## 重启生效

安装或更新后需要完整退出并重新启动 DSH，只刷新窗口不够：

- Host 端代码（`index.js`、`lib/`）只在 DSH 启动时加载；
- 刷新窗口只会重载浏览器端的 `client.js`；
- 首次安装后「测试」提示需要重启 DSH，或报 404 / `transport failure`，说明 Host 端还是旧进程。

## 更新

- GitHub 安装：先 remove 再 add（或直接带新 tag / commit 重新 add）：

```bash
dsh plugin --profile desktop remove dsh-provider-studio
dsh plugin --profile desktop add github:realchendahuang/dsh-provider-studio#v1.3.1
```

- 本地 link 安装：`git pull` 后按需构建，再重启 DSH。依赖没变时不需要 `npm install`，`src/client/` 没改时不需要 `npm run build:client`。

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-provider-studio
```

重启 DSH 后官方 Models 页恢复。供应商配置仍在 profile 的 `cordis.patch.yml`，密钥仍在 DSH 凭据服务，卸载不会删除它们。

## 版本兼容与豁免

`engines.dsh` 在三处检查：

- **安装前**：npm 注册表的包名和本地路径能先读到 `package.json`，不满足直接失败，pnpm 不运行、不下载；
- **拉取后**：`git:` / tarball 要先下载才能读到 `package.json`，不满足时恢复 profile 的 manifest 与 lockfile；
- **启动时**：不满足范围的 bundle 被跳过并列入 `skippedBundles`，除非存在精确版本的豁免。

豁免记录在 profile 的 `compatibility.json`，通过 CLI 管理：

```bash
dsh plugin --profile <profile> version-exemptions
dsh plugin --profile <profile> allow-version <package@version> --dsh-version <runtime> --accept-risk
dsh plugin --profile <profile> revoke-version <package@version> --dsh-version <runtime>
```

豁免只跳过 `engines.dsh` 检查：它不授权依赖的构建脚本，也不会被后续插件版本或 DSH 版本继承。

## 安装排障

- **`[WARN] Issues with peer dependencies found` / `missing peer @deepseek-ai/cordis`**：无害。`@deepseek-ai/cordis` 由 DSH 本体提供，不在 profile 的 `node_modules` 里，pnpm 看不到它；DSH 启动时解析同一份 cordis。安装会正常完成（`+ dsh-provider-studio 1.3.1`）。详见[常见问题](faq.md)。
- **pnpm 要求批准构建脚本**：DSH 以非交互方式运行 pnpm，依赖的安装脚本默认被拦下。只对信任的包在对话框里点「允许这些脚本并重试」。本插件没有 `prepare` 或安装期构建脚本，正常安装不需要放行。
- **GitHub 连不上**：图形界面的「改用国内镜像」只替换 npm 包，替换不了 GitHub 源码。可以在 npm 上按包名安装（镜像能顶 npm 包），或先把仓库克隆到本地，再按「方式三」从目录安装。
- **提示 `already-installed`**：这个包已经是 profile 依赖。先 `dsh plugin --profile <profile> remove dsh-provider-studio`，再重新 add。
- **装完没有「供应商管理」**：需要完整退出并重启 DSH，Host 端不会热加载（见「重启生效」）。若仍没有，按[常见问题](faq.md)第一条排查。
