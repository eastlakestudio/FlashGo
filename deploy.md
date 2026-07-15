# Chrome Web Store Deployment Info

## Single Purpose Description (单一用途描述)

> The single purpose description is required. This can be entered on the Privacy practices tab.

FlashGo is a browser automation tool that allows users to schedule automatic webpage opening and simulated clicking sequences for tasks like flash sales or daily check-ins.
FlashGo 是一款浏览器自动化工具，允许用户在设定的时间自动打开网页并执行一系列模拟点击操作，适用于抢购、定时打卡等场景。

---

## Description (English)
FlashGo is a powerful, yet easy-to-use Chrome extension for browser automation. It helps you automatically open specified webpages and perform a series of rapid clicks on elements exactly when you need them to happen. It is perfectly designed for flash sales, limited-time offers, daily check-ins, auto-logins, and more.

**Key Features:**
*   **Visual Element Picker**: Easily generate clicking sequences by just interacting with the elements on the page. No coding is required.
*   **Flexible Task Scheduling**: Set precise one-time executions (accurate to the second) or recurring tasks for specific days of the week.
*   **Robust Retry Mechanism**: Smart polling ensures the script waits for the page and DOM elements to fully load before clicking. You can also configure page reloads upon failure.
*   **Visual Verification**: Before running a real task, visually test your configuration with a simulated cursor to verify the clicking sequence is correct.
*   **Privacy First**: All task configurations, URLs, and execution histories are strictly saved locally. Your data is NEVER uploaded to any third-party servers.

---

## Description (中文)
FlashGo 是一款强大且易于使用的 Chrome 浏览器自动化扩展程序。它可以帮助您在设定的时间自动打开指定的网页，并模拟人工对页面元素进行快速点击，非常适合用于抢购限量商品、定时打卡、自动签到等场景。

**核心功能：**
*   **可视化的操作录制**：通过简单的点选操作，即可在网页上生成点击序列，无需编写任何代码。
*   **灵活的定时任务**：可设定精确到秒的单次执行任务，或每周特定时间重复执行的周期任务。
*   **高鲁棒性的重试机制**：支持智能轮询等待页面和元素加载，并在失败时根据配置决定是否刷新页面重新尝试，大幅提高成功率。
*   **可视化操作验证**：提供模拟光标演示功能，在正式运行前为您校验配置好的点击步骤是否无误。
*   **隐私安全**：所有任务配置、目标网址和执行历史等数据，均完全保存在您浏览器的本地存储中，绝不会上传到任何第三方服务器。

---

## Permission Justifications (权限使用说明)

To function properly, FlashGo requires the following permissions:

*   **`storage`**: Required to save the user's automated tasks, configurations, and execution history locally on their device.
*   **`alarms`**: Necessary for scheduling tasks to run at the precise time configured by the user (e.g., triggering a flash sale task at exactly 10:00:00).
*   **`tabs`**: Required to automatically open the user-specified target URLs in new tabs when a scheduled task starts.
*   **`sidePanel`**: Provides the main user interface for the extension, allowing users to configure, manage, and verify their automation tasks conveniently alongside their browsing context.
*   **`notifications`**: Used to alert the user about the success, failure, or current status of their automated tasks, especially since tasks often run in the background.
*   **`<all_urls>` (Host Permission)**: Required because users can create automation tasks (clicking sequences) for *any* website they choose. The extension needs to inject content scripts to interact with the DOM of user-specified web pages to perform the automated clicks.
