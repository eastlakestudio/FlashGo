document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('targetUrl');
  const selectorInput = document.getElementById('targetSelector');
  const timeInput = document.getElementById('targetTime');
  const advanceInput = document.getElementById('advanceSeconds');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

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
    // Format to YYYY-MM-DDThh:mm
    const tzoffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
    timeInput.value = localISOTime;
  }

  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    const selector = selectorInput.value.trim();
    const timeStr = timeInput.value;
    const advance = parseInt(advanceInput.value, 10);

    if (!url || !selector || !timeStr || isNaN(advance)) {
      statusDiv.style.color = '#ef4444';
      statusDiv.textContent = '请填写所有字段！';
      return;
    }

    const targetTimeMs = new Date(timeStr).getTime();
    if (targetTimeMs <= Date.now()) {
      statusDiv.style.color = '#ef4444';
      statusDiv.textContent = '目标时间必须在未来！';
      return;
    }

    const newConfig = {
      url,
      selector,
      time: timeStr,
      targetTimeMs,
      advance
    };

    await chrome.storage.local.set({ config: newConfig });
    
    statusDiv.style.color = '#10b981';
    statusDiv.textContent = '保存成功！';
    
    // Notify background script
    await chrome.runtime.sendMessage({ action: 'SCHEDULE_TASK', config: newConfig });
    
    setTimeout(() => {
      statusDiv.textContent = '';
    }, 2000);
  });
});
