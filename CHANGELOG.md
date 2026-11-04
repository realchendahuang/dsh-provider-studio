# Changelog

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
