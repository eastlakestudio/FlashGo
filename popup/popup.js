document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('targetUrl');
  const selectorInput = document.getElementById('targetSelector');
  const timeInput = document.getElementById('targetTime');
  const advanceInput = document.getElementById('advanceSeconds');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const pickBtn = document.getElementById('pickBtn');
  const verifyBtn = document.getElementById('verifyBtn');

  // Load existing config
  const { config } = await chrome.storage.local.get('config');
  if (config) {
    urlInput.value = config.url || '';
    selectorInput.value = config.selector || '';
    timeInput.value = config.time || '';
    advanceInput.value = config.advance || 5;
  } else {
    // Set default time to next minute
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    now.setSeconds(0);
    now.setMilliseconds(0);
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    timeInput.value = localISOTime;
  }

  function showStatus(text, color) {
    statusDiv.style.color = color;
    statusDiv.textContent = text;
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 3000);
  }

  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const selector = selectorInput.value.trim();
    const timeStr = timeInput.value;
    const advance = parseInt(advanceInput.value, 10);

    if (!url || !selector || !timeStr || isNaN(advance)) {
      showStatus('请填写所有字段！', '#ef4444');
      return;
    }

    const targetTimeMs = new Date(timeStr).getTime();
    if (targetTimeMs <= Date.now()) {
      showStatus('目标时间必须在未来！', '#ef4444');
      return;
    }

    const newConfig = { url, selector, time: timeStr, targetTimeMs, advance };

    await chrome.storage.local.set({ config: newConfig });
    showStatus('保存成功！', '#10b981');
    
    await chrome.runtime.sendMessage({ action: 'SCHEDULE_TASK', config: newConfig });
  });

  pickBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKING' });
      window.close(); // Close popup so user can pick
    } catch (err) {
      showStatus('请先刷新网页，或确保网页允许注入脚本。', '#ef4444');
    }
  });

  verifyBtn.addEventListener('click', async () => {
    const selector = selectorInput.value.trim();
    if (!selector) {
      showStatus('请先填写选择器！', '#ef4444');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'VERIFY_SELECTOR', selector });
      window.close(); // Close popup to watch verification
    } catch (err) {
      showStatus('请先刷新网页，或确保网页允许注入脚本。', '#ef4444');
    }
  });

  // Listen for picked selector if popup was kept open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SELECTOR_PICKED') {
      selectorInput.value = message.selector;
    }
  });
});
