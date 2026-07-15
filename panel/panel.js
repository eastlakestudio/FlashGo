document.addEventListener('DOMContentLoaded', () => {
  const listView = document.getElementById('listView');
  const editorView = document.getElementById('editorView');
  const createTaskBtn = document.getElementById('createTaskBtn');
  const backToListBtn = document.getElementById('backToListBtn');
  const tasksContainer = document.getElementById('tasksContainer');
  
  // Editor elements
  const taskNameInput = document.getElementById('taskName');
  const autoNameBtn = document.getElementById('autoNameBtn');
  const urlInput = document.getElementById('targetUrl');
  const timeInput = document.getElementById('targetTime');
  const advanceInput = document.getElementById('advanceSeconds');
  const delayInput = document.getElementById('stepDelayMs');
  const maxRetriesInput = document.getElementById('maxRetries');
  const retryDelayMsInput = document.getElementById('retryDelayMs');
  const reloadOnRetryInput = document.getElementById('reloadOnRetry');
  const stepsContainer = document.getElementById('stepsContainer');
  const startPickingBtn = document.getElementById('startPickingBtn');
  const verifyBtn = document.getElementById('verifyBtn');
  const statusMsg = document.getElementById('statusMsg');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const scheduleBtn = document.getElementById('scheduleBtn');

  // New elements for recurring logic
  const tabOnce = document.getElementById('tabOnce');
  const tabRecurring = document.getElementById('tabRecurring');
  const onceTimeGroup = document.getElementById('onceTimeGroup');
  const recurringTimeGroup = document.getElementById('recurringTimeGroup');
  const recurringTimeInput = document.getElementById('recurringTime');
  const dayBtns = document.querySelectorAll('.day-btn');

  let fpTargetTime = null;
  let fpRecurringTime = null;

  // Initialize Flatpickr
  if (typeof flatpickr !== 'undefined') {
    fpTargetTime = flatpickr(timeInput, {
      enableTime: true,
      dateFormat: "Y-m-d H:i",
      time_24hr: true,
      minDate: "today",
      minuteIncrement: 1
    });

    fpRecurringTime = flatpickr(recurringTimeInput, {
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      time_24hr: true,
      minuteIncrement: 1
    });
  }

  let currentEditingTaskId = null;
  let selectors = [];
  let scheduleType = 'once';
  let recurringDays = [];

  // Tab switching logic
  function setScheduleType(type) {
    scheduleType = type;
    if (type === 'once') {
      tabOnce.classList.add('active');
      tabRecurring.classList.remove('active');
      onceTimeGroup.style.display = 'block';
      recurringTimeGroup.style.display = 'none';
    } else {
      tabRecurring.classList.add('active');
      tabOnce.classList.remove('active');
      recurringTimeGroup.style.display = 'block';
      onceTimeGroup.style.display = 'none';
    }
  }

  tabOnce.addEventListener('click', () => setScheduleType('once'));
  tabRecurring.addEventListener('click', () => setScheduleType('recurring'));

  // Day toggle logic
  dayBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.classList.toggle('active');
      const day = parseInt(e.target.dataset.day, 10);
      if (recurringDays.includes(day)) {
        recurringDays = recurringDays.filter(d => d !== day);
      } else {
        recurringDays.push(day);
      }
    });
  });

  function updateUrlToCurrentTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        if (!urlInput.value) {
          urlInput.value = tabs[0].url;
        }
      }
    });
  }

  function renderView(isEditor, task = null) {
    if (isEditor) {
      listView.style.display = 'none';
      editorView.style.display = 'block';
      
      if (task) {
        currentEditingTaskId = task.id;
        taskNameInput.value = task.name || '';
        urlInput.value = task.url;
        selectors = [...task.selectors];
        
        scheduleType = task.scheduleType || 'once';
        setScheduleType(scheduleType);
        
        if (task.targetTimeMs) {
          const d = new Date(task.targetTimeMs);
          const tzOffset = d.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0,16).replace('T', ' ');
          if (fpTargetTime) fpTargetTime.setDate(localISOTime);
          else timeInput.value = localISOTime;
        } else {
          if (fpTargetTime) fpTargetTime.clear();
          else timeInput.value = '';
        }

        if (fpRecurringTime) fpRecurringTime.setDate(task.recurringTime || '');
        else recurringTimeInput.value = task.recurringTime || '';
        
        recurringDays = [...(task.recurringDays || [])];
        dayBtns.forEach(btn => {
          const d = parseInt(btn.dataset.day, 10);
          if (recurringDays.includes(d)) btn.classList.add('active');
          else btn.classList.remove('active');
        });

        advanceInput.value = task.advanceSeconds || 5;
        delayInput.value = task.delayMs || 100;
        maxRetriesInput.value = task.maxRetries || 0;
        retryDelayMsInput.value = task.retryDelayMs !== undefined ? task.retryDelayMs : 1000;
        reloadOnRetryInput.checked = !!task.reloadOnRetry;
      } else {
        currentEditingTaskId = null;
        taskNameInput.value = '';
        urlInput.value = '';
        updateUrlToCurrentTab();
        selectors = [];
        if (fpTargetTime) fpTargetTime.clear();
        else timeInput.value = '';
        
        advanceInput.value = 5;
        delayInput.value = 100;
        maxRetriesInput.value = 0;
        retryDelayMsInput.value = 1000;
        reloadOnRetryInput.checked = false;
        
        setScheduleType('once');
        
        if (fpRecurringTime) fpRecurringTime.clear();
        else recurringTimeInput.value = '';
        
        recurringDays = [];
        dayBtns.forEach(b => b.classList.remove('active'));
      }
      renderSteps();
      statusMsg.textContent = '';
    } else {
      editorView.style.display = 'none';
      listView.style.display = 'block';
      loadTasks();
    }
  }

  function getNextRecurringTime(recurringTimeStr, recurringDaysArr) {
    if (!recurringTimeStr || !recurringDaysArr || recurringDaysArr.length === 0) return null;
    const [hours, minutes] = recurringTimeStr.split(':').map(Number);
    const now = new Date();
    for (let i = 0; i <= 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = d.getDay();
      if (recurringDaysArr.includes(dayOfWeek)) {
        const candidate = new Date(d);
        candidate.setHours(hours, minutes, 0, 0);
        if (candidate.getTime() > now.getTime()) {
          return candidate.getTime();
        }
      }
    }
    return null;
  }

  function loadTasks() {
    chrome.storage.local.get('tasks', (data) => {
      const tasks = data.tasks || [];
      tasksContainer.innerHTML = '';
      if (tasks.length === 0) {
        tasksContainer.innerHTML = '<div style="color:var(--text-muted); font-size: 13px; text-align: center; margin-top: 40px;">暂无抢购任务，点击"新建任务"开始</div>';
        return;
      }

      // Sort: scheduled first, then draft, then completed/failed
      tasks.sort((a, b) => {
        const order = { 'scheduled': 0, 'draft': 1, 'failed': 2, 'completed': 3 };
        return (order[a.status] || 99) - (order[b.status] || 99);
      });

      tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        
        let statusText = '暂存';
        let statusClass = 'status-draft';
        if (task.status === 'scheduled') { statusText = '调度中'; statusClass = 'status-scheduled'; }
        if (task.status === 'completed') { statusText = '已完成'; statusClass = 'status-completed'; }
        if (task.status === 'failed') { statusText = '已失败'; statusClass = 'status-failed'; }

        let timeText = '未设置时间';
        let nextRunText = '';
        
        if (task.scheduleType === 'recurring') {
          const daysMap = ['日','一','二','三','四','五','六'];
          const daysStr = (task.recurringDays || []).map(d => daysMap[d]).join('、');
          timeText = `每周${daysStr} ${task.recurringTime || ''} 循环`;
          
          if (task.status === 'scheduled') {
            const nextMs = getNextRecurringTime(task.recurringTime, task.recurringDays);
            if (nextMs) {
              nextRunText = `<div style="color:var(--primary); font-weight: 500; margin-top: 4px;">🚀 下次执行: ${new Date(nextMs).toLocaleString()}</div>`;
            }
          }
        } else if (task.targetTimeMs) {
          timeText = new Date(task.targetTimeMs).toLocaleString();
          if (task.status === 'scheduled') {
             if (task.targetTimeMs > Date.now()) {
                nextRunText = `<div style="color:var(--primary); font-weight: 500; margin-top: 4px;">🚀 下次执行: ${new Date(task.targetTimeMs).toLocaleString()}</div>`;
             } else {
                nextRunText = `<div style="color:var(--danger); font-weight: 500; margin-top: 4px;">⚠️ 任务已过期</div>`;
             }
          }
        }

        card.innerHTML = `
          <div class="task-header">
            <div class="task-name" title="${task.url}">${task.name || task.url}</div>
            <div class="task-status ${statusClass}">${statusText}</div>
          </div>
          <div class="task-url-sub">${task.url}</div>
          <div class="task-details" style="margin-top: 8px;">
            <span>时间: ${timeText} | 步骤: ${task.selectors.length}</span>
            ${nextRunText}
          </div>
          <div class="task-actions">
            <button class="icon-btn btn-edit" title="编辑">✏️ 编辑</button>
            <button class="icon-btn danger btn-delete" title="删除">🗑️ 删除</button>
          </div>
        `;

        card.querySelector('.btn-edit').addEventListener('click', () => renderView(true, task));
        card.querySelector('.btn-delete').addEventListener('click', () => {
          if (confirm('确定要删除这个任务吗？')) {
            chrome.storage.local.get('tasks', (d) => {
              const tks = d.tasks || [];
              const newTks = tks.filter(t => t.id !== task.id);
              chrome.storage.local.set({ tasks: newTks }, loadTasks);
            });
          }
        });

        tasksContainer.appendChild(card);
      });
    });
  }

  function renderSteps() {
    stepsContainer.innerHTML = '';
    selectors.forEach((sel, index) => {
      const div = document.createElement('div');
      div.className = 'step-item';
      div.innerHTML = `
        <span style="font-size:12px; font-weight:bold; color:var(--text-muted);">${index + 1}.</span>
        <input type="text" value="${sel}" data-index="${index}" class="step-input" style="flex:1;">
        <button type="button" class="icon-btn locate-step-btn" data-index="${index}" title="在页面中高亮此元素">🔍</button>
        <button type="button" class="icon-btn danger delete-step-btn" data-index="${index}" title="删除此步">✖</button>
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
        const idx = parseInt(e.currentTarget.dataset.index);
        selectors.splice(idx, 1);
        renderSteps();
      });
    });
    document.querySelectorAll('.locate-step-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const selector = selectors[idx];
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && selector) {
          chrome.tabs.sendMessage(tab.id, { action: 'HIGHLIGHT_ELEMENT', selector }).catch(() => {});
        }
      });
    });
  }

  function showStatus(text, color) {
    statusMsg.textContent = text;
    statusMsg.style.color = color;
  }

  async function saveTask(status) {
    // Collect from inputs
    document.querySelectorAll('.step-input').forEach(input => {
      const idx = parseInt(input.dataset.index);
      selectors[idx] = input.value.trim();
    });
    selectors = selectors.filter(s => s);

    if (!urlInput.value.trim()) {
      showStatus('请输入目标网址！', 'var(--danger)');
      return;
    }

    let name = taskNameInput.value.trim();
    if (!name) {
      showStatus('正在自动完善名称...', 'var(--text-muted)');
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'GENERATE_TASK_NAME', selectors });
          if (response && response.name) name = response.name;
        }
      } catch (e) {}
      if (!name) name = '未命名任务';
      taskNameInput.value = name;
    }

    const url = urlInput.value.trim();
    const advance = parseInt(advanceInput.value, 10) || 5;
    const delay = parseInt(delayInput.value, 10) || 100;
    const maxR = parseInt(maxRetriesInput.value, 10) || 0;
    const rDelay = parseInt(retryDelayMsInput.value, 10) || 1000;
    const doReload = reloadOnRetryInput.checked;

    let targetTimeMs = null;
    let recTime = null;

    if (scheduleType === 'once') {
      const timeStr = timeInput.value;
      if (status === 'scheduled') {
        if (!timeStr) { showStatus('单次任务请设置目标触发时间！', 'var(--danger)'); return; }
        targetTimeMs = new Date(timeStr).getTime();
        if (isNaN(targetTimeMs)) { showStatus('时间格式错误', 'var(--danger)'); return; }
      } else {
        if (timeStr) targetTimeMs = new Date(timeStr).getTime();
      }
    } else {
      recTime = recurringTimeInput.value;
      if (status === 'scheduled') {
        if (!recTime) { showStatus('周期任务请填写每日触发时间！', 'var(--danger)'); return; }
        if (recurringDays.length === 0) { showStatus('周期任务请至少选择一天！', 'var(--danger)'); return; }
      }
    }

    const newTask = {
      id: currentEditingTaskId || Date.now().toString(),
      name,
      url,
      selectors,
      scheduleType,
      targetTimeMs,
      recurringTime: recTime,
      recurringDays,
      advanceSeconds: advance,
      delayMs: delay,
      maxRetries: maxR,
      retryDelayMs: rDelay,
      reloadOnRetry: doReload,
      status: status
    };

    chrome.storage.local.get('tasks', (data) => {
      let tks = data.tasks || [];
      const idx = tks.findIndex(t => t.id === newTask.id);
      if (idx !== -1) {
        tks[idx] = newTask;
      } else {
        tks.push(newTask);
      }
      chrome.storage.local.set({ tasks: tks }, () => {
        renderView(false);
      });
    });
  }

  // Event Listeners
  createTaskBtn.addEventListener('click', () => renderView(true));
  backToListBtn.addEventListener('click', () => renderView(false));
  
  startPickingBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKING' });
      showStatus('请在左侧网页中依次点击目标元素。', 'var(--success)');
    } catch (err) {
      showStatus('请先刷新左侧网页，或确保网页允许注入脚本。', 'var(--danger)');
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SELECTOR_PICKED') {
      selectors.push(message.selector);
      renderSteps();
      showStatus(`已添加第 ${selectors.length} 步！`, 'var(--success)');
    }
  });

  verifyBtn.addEventListener('click', async () => {
    if (selectors.length === 0) { showStatus('请先添加操作步骤！', 'var(--danger)'); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    verifyBtn.innerHTML = '刷新中...';
    verifyBtn.disabled = true;

    try {
      await chrome.tabs.reload(tab.id);
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'VERIFY_SEQUENCE', selectors, delayMs: parseInt(delayInput.value) || 100 }).catch(()=>{});
            verifyBtn.innerHTML = '▶ 验证操作';
            verifyBtn.disabled = false;
          }, 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (err) {
      showStatus('刷新失败。', 'var(--danger)');
      verifyBtn.innerHTML = '▶ 验证操作';
      verifyBtn.disabled = false;
    }
  });

  autoNameBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    autoNameBtn.textContent = '...';
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'GENERATE_TASK_NAME', selectors });
      if (response && response.name) {
        taskNameInput.value = response.name;
      } else {
        taskNameInput.value = tab.title || '抢购任务';
      }
    } catch (err) {
      taskNameInput.value = tab.title || '抢购任务';
    }
    autoNameBtn.textContent = '🤖 自动完善';
  });

  saveDraftBtn.addEventListener('click', () => saveTask('draft'));
  scheduleBtn.addEventListener('click', () => saveTask('scheduled'));

  // Init
  loadTasks();
});
