document.addEventListener('DOMContentLoaded', () => {
  // i18n initialization
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerHTML = chrome.i18n.getMessage(el.getAttribute('data-i18n')) || el.innerHTML;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder')) || el.placeholder;
  });

  // 强制修复扩展侧边栏中 Flatpickr 时间滚轮失效的问题
  document.addEventListener('wheel', (e) => {
    if (e.target.classList.contains('flatpickr-hour') || e.target.classList.contains('flatpickr-minute')) {
      e.preventDefault();
      const isUp = e.deltaY < 0;
      const min = parseInt(e.target.min) || 0;
      const max = parseInt(e.target.max) || (e.target.classList.contains('flatpickr-hour') ? 23 : 59);
      const step = parseInt(e.target.step) || 1;
      let val = parseInt(e.target.value) || 0;
      
      if (isUp) {
        val = val + step > max ? min : val + step;
      } else {
        val = val - step < min ? max : val - step;
      }
      
      e.target.value = val.toString().padStart(2, '0');
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, { passive: false });

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
        tasksContainer.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage('noTasks')}</div>`;
        return;
      }
      // Sort: scheduled first, then draft, then completed/failed
      tasks.sort((a, b) => {
        const order = { 'scheduled': 0, 'draft': 1, 'failed': 2, 'completed': 3 };
        return (order[a.status] || 99) - (order[b.status] || 99);
      });

      if (tasks.length === 0) {
        tasksContainer.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage('noTasks')}</div>`;
        return;
      }

      tasksContainer.innerHTML = '';
      tasks.forEach((task, index) => {
        const card = document.createElement('div');
        card.className = 'task-card';

        let statusText = chrome.i18n.getMessage('statusPaused');
        let statusClass = 'status-paused';
        if (task.status === 'scheduled') { statusText = chrome.i18n.getMessage('statusScheduled'); statusClass = 'status-active'; }
        if (task.status === 'completed') { statusText = chrome.i18n.getMessage('statusCompleted'); statusClass = 'status-completed'; }
        if (task.status === 'failed') { statusText = chrome.i18n.getMessage('statusFailed'); statusClass = 'status-failed'; }

        let timeText = chrome.i18n.getMessage('notSetTime');
        let nextRunText = '';
        
        if (task.scheduleType === 'recurring') {
          const daysMap = [
            chrome.i18n.getMessage('day0'), chrome.i18n.getMessage('day1'), chrome.i18n.getMessage('day2'), 
            chrome.i18n.getMessage('day3'), chrome.i18n.getMessage('day4'), chrome.i18n.getMessage('day5'), chrome.i18n.getMessage('day6')
          ];
          const daysStr = (task.recurringDays || []).map(d => daysMap[d]).join('、');
          timeText = `${chrome.i18n.getMessage('weekly')}${daysStr} ${task.recurringTime || ''}`;
          
          if (task.status === 'scheduled') {
            const nextMs = getNextRecurringTime(task.recurringTime, task.recurringDays);
            if (nextMs) {
              nextRunText = `<div style="color:var(--primary); font-weight: 500; margin-top: 4px;">${chrome.i18n.getMessage('nextExec')}${new Date(nextMs).toLocaleString()}</div>`;
            }
          }
        } else if (task.targetTimeMs) {
          timeText = new Date(task.targetTimeMs).toLocaleString();
          if (task.status === 'scheduled') {
             if (task.targetTimeMs > Date.now()) {
                nextRunText = `<div style="color:var(--primary); font-weight: 500; margin-top: 4px;">${chrome.i18n.getMessage('nextExec')}${new Date(task.targetTimeMs).toLocaleString()}</div>`;
             } else {
                nextRunText = `<div style="color:var(--danger); font-weight: 500; margin-top: 4px;">${chrome.i18n.getMessage('taskExpired')}</div>`;
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
            <span>${chrome.i18n.getMessage('timeLabel')}${timeText} | ${chrome.i18n.getMessage('stepLabel')}${task.selectors.length}</span>
            ${nextRunText}
          </div>
          <div class="task-actions">
            <button class="icon-btn btn-edit" title="Edit">${chrome.i18n.getMessage('editBtn')}</button>
            <button class="icon-btn danger btn-delete" title="Delete">${chrome.i18n.getMessage('deleteBtn')}</button>
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
  
  async function getOrActivateTargetTab() {
    const url = urlInput.value.trim();
    if (!url) return null;
    const tabs = await chrome.tabs.query({});
    let targetTab = tabs.find(t => t.url && t.url.includes(url.split('?')[0])); // 忽略复杂参数匹配
    
    if (targetTab) {
      await chrome.tabs.update(targetTab.id, { active: true });
      await chrome.windows.update(targetTab.windowId, { focused: true });
    } else {
      targetTab = await chrome.tabs.create({ url, active: true });
      // 简单等待 2 秒加载
      await new Promise(r => setTimeout(r, 2000));
    }
    return targetTab;
  }

  startPickingBtn.addEventListener('click', async () => {
    if (!urlInput.value.trim()) { showStatus(chrome.i18n.getMessage('pleaseInputUrl'), 'var(--danger)'); return; }
    showStatus(chrome.i18n.getMessage('switchTarget'), 'var(--text-muted)');
    const tab = await getOrActivateTargetTab();
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKING' });
      showStatus(chrome.i18n.getMessage('pickTargetElement'), 'var(--success)');
    } catch (err) {
      showStatus(chrome.i18n.getMessage('pickError'), 'var(--danger)');
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SELECTOR_PICKED') {
      selectors.push(message.selector);
      renderSteps();
      showStatus(chrome.i18n.getMessage('stepAdded', [selectors.length]), 'var(--success)');
    }
  });

  verifyBtn.addEventListener('click', async () => {
    if (selectors.length === 0) { showStatus(chrome.i18n.getMessage('pleaseAddSteps'), 'var(--danger)'); return; }
    if (!urlInput.value.trim()) { showStatus(chrome.i18n.getMessage('pleaseInputUrl'), 'var(--danger)'); return; }
    
    showStatus(chrome.i18n.getMessage('switchTarget'), 'var(--text-muted)');
    const tab = await getOrActivateTargetTab();
    if (!tab) return;

    verifyBtn.innerHTML = chrome.i18n.getMessage('refreshing');
    verifyBtn.disabled = true;

    try {
      await chrome.tabs.reload(tab.id);
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'VERIFY_SEQUENCE', selectors, delayMs: parseInt(delayInput.value) || 100 }).catch(()=>{});
            verifyBtn.innerHTML = chrome.i18n.getMessage('verifyOperation');
            verifyBtn.disabled = false;
          }, 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (err) {
      showStatus(chrome.i18n.getMessage('refreshFail'), 'var(--danger)');
      verifyBtn.innerHTML = chrome.i18n.getMessage('verifyOperation');
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
