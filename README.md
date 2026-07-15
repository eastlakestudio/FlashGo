[中文版](#flashgo---闪电购) | [English Version](#flashgo---quickbuy-en)

# FlashGo - 闪电购

FlashGo 是一款强大且易于使用的 Chrome 浏览器自动化扩展程序。它可以帮助您在设定的时间自动打开指定的网页，并模拟人工对页面元素进行快速点击，非常适合用于抢购、定时打卡、自动签到等场景。

## ✨ 核心功能

* **可视化的操作录制**：通过简单的点选操作，即可在网页上生成 CSS 选择器序列，无需编写任何代码。
* **灵活的定时任务**：
  * **单次执行**：设定一个具体的时间，精确到秒。
  * **周期执行**：设定每周固定的一天或几天，在特定时间重复执行任务。
* **高鲁棒性的重试机制**：支持智能轮询等待页面和元素加载，并在失败时根据配置决定是否刷新页面重新尝试。
* **可视化操作验证**：通过模拟光标点击，为您在运行前演示并校验所有配置好的点击步骤是否无误。
* **中英双语支持 (i18n)**：根据您的操作系统和浏览器语言，自动切换界面语言，无缝对接。

## 📦 安装说明

1. 下载本仓库的代码。
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
3. 在右上角开启 **“开发者模式”**。
4. 点击左上角的 **“加载已解压的扩展程序”**，选择本仓库所在的文件夹。
5. 扩展安装成功！建议将 FlashGo 侧边栏固定在浏览器右侧，方便随时调用。

## 🛠 技术栈

* 原生 JavaScript (ES6+), HTML5, CSS3
* Chrome Extension Manifest V3
* Chrome Side Panel API
* [Flatpickr](https://flatpickr.js.org/) - 用于精美的日期和时间选择器

## 🔒 隐私安全

FlashGo 承诺保护您的隐私。所有任务配置、目标网址和执行历史等数据，均完全保存在您浏览器的本地存储（Local Storage）中，**绝不会上传到任何第三方服务器**。

详情请参考 [隐私条款 (Privacy Policy)](./隐私条款.html)。

---

<br><br>

<a name="flashgo---quickbuy-en"></a>
# FlashGo

FlashGo is a powerful and easy-to-use Chrome extension for browser automation. It helps you automatically open specified webpages and rapid-click buttons on schedule. It is perfect for flash sales, daily check-ins, auto-logins, and more.

## ✨ Features

* **Visual Element Picker**: Easily generate CSS selector sequences just by clicking elements on the page. No coding required.
* **Flexible Task Scheduling**:
  * **One-time Run**: Set a specific time, accurate to the second.
  * **Recurring Run**: Select specific days of the week and a time to run tasks repeatedly.
* **Robust Retry Mechanism**: Smart polling ensures the script waits for the page and DOM elements to fully load. Configurable page reload upon failure.
* **Visual Verification**: Before running a task, visually test your configuration with a simulated mouse cursor that demonstrates the clicking sequence.
* **Bilingual Support (i18n)**: Automatically switches between English and Chinese interfaces based on your browser and OS settings.

## 📦 Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the folder containing this repository.
5. Success! We recommend pinning the FlashGo side panel to the right side of your browser for quick access.

## 🛠 Tech Stack

* Vanilla JavaScript (ES6+), HTML5, CSS3
* Chrome Extension Manifest V3
* Chrome Side Panel API
* [Flatpickr](https://flatpickr.js.org/) - for beautiful date and time selection

## 🔒 Privacy & Security

FlashGo is committed to protecting your privacy. All your task configurations, URLs, and execution history are stored **strictly locally** in your browser's Local Storage. **Your data is NEVER uploaded to any third-party servers.**

For more details, please refer to our [Privacy Policy](./隐私条款.html).

---
*Created by EastlakeStudio.*
