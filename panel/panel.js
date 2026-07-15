document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('targetUrl');
  const timeInput = document.getElementById('targetTime');
  const advanceInput = document.getElementById('advanceSeconds');
  const delayInput = document.getElementById('delayMs');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const addStepBtn = document.getElementById('addStepBtn');
  const verifyBtn = document.getElementById('verifyBtn');
  const stepsContainer = document.getElementById('stepsContainer');

  let selectors = [];

  function renderSteps() {
    stepsContainer.innerHTML = '';
    if (selectors.length === 0) {
      stepsContainer.innerHTML = '<div style="color:#9ca3af; font-size:12px; text-align:center;">暂无步骤，请点击下方添加</div>';
      return;
    }
    selectors.forEach((sel, index) => {
      const div = document.createElement('div');
      div.className = 'step-item';
      div.innerHTML = `
        <span style="font-size:12px; font-weight:bold; color:#6b7280;">${index + 1}.</span>
        <input type="text" value="${sel}" data-index="${index}" class="step-input" placeholder="CSS Selector">
        <button type="button" class="btn-danger delete-step-btn" data-index="${index}">删除</button>
      `;
      stepsContainer.appendChild(div);
    });

    document.querySelectorAll('.step-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        selectors[idx] = e.target.value.trim();
      });
    });

    document.querySelectorAll('.delete-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        selectors.splice(idx, 1);
        renderSteps();
      });
    });
  }

  // Load existing config
  const { config } = await chrome.storage.local.get('config');
  if (config) {
    urlInput.value = config.url || '';
    if (config.selectors && config.selectors.length > 0) {
      selectors = config.selectors;
    } else if (config.selector) {
      // Migrate old data
      selectors = [config.selector];
    }
    timeInput.value = config.time || '';
    advanceInput.value = config.advance || 5;
    delayInput.value = config.delayMs !== undefined ? config.delayMs : 100;
  } else {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    now.setSeconds(0);
    now.setMilliseconds(0);
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    timeInput.value = localISOTime;
  }
  
  renderSteps();

  function showStatus(text, color) {
    statusDiv.style.color = color;
    statusDiv.textContent = text;
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 3000);
  }

  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const timeStr = timeInput.value;
    const advance = parseInt(advanceInput.value, 10);
    const delayMs = parseInt(delayInput.value, 10);

    // Sync from inputs in case they typed without changing focus
    document.querySelectorAll('.step-input').forEach(input => {
      const idx = parseInt(input.dataset.index);
      selectors[idx] = input.value.trim();
    });
    
    // Filter out empty
    selectors = selectors.filter(s => s);
    renderSteps();

    if (!url || selectors.length === 0 || !timeStr || isNaN(advance) || isNaN(delayMs)) {
      showStatus('请填写所有必填项，且至少包含一个步骤！', '#ef4444');
      return;
    }

    const targetTimeMs = new Date(timeStr).getTime();
    if (targetTimeMs <= Date.now()) {
      showStatus('目标时间必须在未来！', '#ef4444');
      return;
    }

    const newConfig = { 
      url, 
      selectors, 
      time: timeStr, 
      targetTimeMs, 
      advance,
      delayMs,
      currentStepIndex: 0 // Reset execution state
    };

    await chrome.storage.local.set({ config: newConfig });
    showStatus('保存成功！', '#10b981');
    
    await chrome.runtime.sendMessage({ action: 'SCHEDULE_TASK', config: newConfig });
  });

  addStepBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    // Before picking, save current selectors to storage so content script can append
    const currentConfig = (await chrome.storage.local.get('config')).config || {};
    currentConfig.selectors = selectors;
    await chrome.storage.local.set({ config: currentConfig });

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKING' });
    } catch (err) {
      showStatus('请先刷新网页，或确保网页允许注入脚本。', '#ef4444');
    }
  });

  verifyBtn.addEventListener('click', async () => {
    document.querySelectorAll('.step-input').forEach(input => {
      const idx = parseInt(input.dataset.index);
      selectors[idx] = input.value.trim();
    });
    selectors = selectors.filter(s => s);

    if (selectors.length === 0) {
      showStatus('请先添加至少一个步骤！', '#ef4444');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'VERIFY_SEQUENCE', selectors });
    } catch (err) {
      showStatus('请先刷新网页，或确保网页允许注入脚本。', '#ef4444');
    }
  });

  // Listen for picked selector if popup was kept open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SELECTOR_PICKED') {
      selectors.push(message.selector);
      renderSteps();
    }
  });

  // Automatically update the URL input to the current active tab's URL
  async function updateUrlToCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && !tab.url.startsWith('chrome://')) {
        urlInput.value = tab.url;
      }
    } catch (err) {}
  }

  // Initial update
  updateUrlToCurrentTab();

  // Update on tab switch
  chrome.tabs.onActivated.addListener(() => {
    updateUrlToCurrentTab();
  });

  // Update on tab navigation
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url && !changeInfo.url.startsWith('chrome://')) {
      urlInput.value = changeInfo.url;
    }
  });
});
