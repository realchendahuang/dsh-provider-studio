# 常见问题

[English](../faq.md) | 简体中文

## 设置里没有「供应商管理」

1. 确认装到了你正在用的 profile：`dsh plugin --profile desktop why dsh-provider-studio`；
2. 完全退出 DSH 再打开（刷新窗口不够）；
3. 检查 profile 的 `cordis.patch.yml` 里有没有 `- id: dsh-provider-studio` + `disabled: true`（可能被其他工具禁用），删掉后重启。

## 打开设置整页白屏 / Failed to load plugins

通常是 profile 里的插件条目和磁盘上的 `client.js` 版本对不上（改包名、半更新状态），或者是某个插件加载直接抛错。先重启；仍然不行就 remove 再 add 一次。

## 「测试」报 404 或 transport failure

Host 端还是旧进程，重启 DSH 即可。界面里也会给这条提示。

## 密钥显示为空

这个供应商的密钥来自环境变量（`$SOME_API_KEY`），凭据服务里没有真实值，插件不会伪造明文；可以在本页直接粘贴一个新密钥覆盖。

## 「测试」/「拉取模型」报 PROBE_REDIRECT

端点把请求重定向到了另一个源（比如配置的网关 302 到第三方域名）。插件只在**同一源内**跟随重定向，跨源一律拒绝，避免把 API Key（尤其是 `x-api-key`）带到别的主机；直接填最终地址即可。

## 官方 Models 页不见了

预期行为，见[设计](design.md)的「与官方 Models 设置页的关系」。改 `cordis.patch.yml` 一行即可恢复。

## 保存报 `SETTINGS_CONFLICT`

配置在页面读取之后、保存之前被别处改动了（另一个窗口、编辑器或别的插件）。点「重新加载」重新读一次，然后再保存。

## 保存提示「未写入磁盘」

Host 用 `settings.replace()` 写过之后会回读文档核对，但改动没有出现在文档里，所以界面拒绝报告成功。先看 DSH 日志里的写入失败原因，重新加载后重试；profile 的 `cordis.patch.yml` 仍是权威副本。

## 安装时打印 [WARN] Issues with peer dependencies found / missing peer @deepseek-ai/cordis

无害，可以忽略。`@deepseek-ai/cordis` 是 DSH 本体提供的运行时框架，不在 profile 的 `node_modules` 里，pnpm 因此看不到它；DSH 启动时会从安装体解析同一份 cordis，插件和 DSH 自带组合包都是这么工作的。安装本身会正常完成（`+ dsh-provider-studio 1.3.1`）。
