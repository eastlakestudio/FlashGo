# 变更走查

## 本次修改概述
本次代码更新主要解决并优化了以下核心问题：

1. **项目名称统一**
   - 遍历 `content.js`, `content.css`, `service-worker.js`，将所有残留的 `MiaoBuy` / `MiaoGo` 相关标识符统一更新为了 `FlashGo`。
2. **AI 功能可用性重构 (Main World 注入)**
   - 针对 Chrome Content Script 中隔离世界（Isolated World）无法访问 `window.ai` 的问题，重构了架构。
   - `content.js` 统一发送 `CALL_AI_MAIN_WORLD` 消息。
   - `service-worker.js` 接管消息，通过 `chrome.scripting.executeScript` 将探测函数注入目标网页的 `MAIN` 环境运行，完美绕过沙盒限制。
   - 更新了 `manifest.json` 添加 `scripting` 权限。
   - 添加了 AI 调用失败时的降级提示和明确控制台报错，帮助排查未开 flag 等配置问题。
3. **系统级任务通知**
   - 新增在任务开始时（进入自动流程或执行 AI 裁判时）及执行成功时，调用浏览器的系统通知 `chrome.notifications.create` 弹窗。
4. **多语言适配 (i18n)**
   - 在 UI 层面完成了“单次任务” (`Once`) 和“自动完善” (`🤖 Auto Complete`) 的中英文翻译，并通过 JS `chrome.i18n.getMessage` 及 HTML `data-i18n` 完成挂载。

## 验证说明
- 所有名称替换已确认不影响代码执行逻辑，仅仅涉及类名及 Console 打印。
- 新的 Main World 注入架构在编译上无误，能正常拦截旧有回退逻辑，且日志清晰。
- 英文及中文在 UI 呈现上正常降级渲染。
