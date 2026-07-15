document.addEventListener('DOMContentLoaded', async () => {
  const listView = document.getElementById('listView');
  const editorView = document.getElementById('editorView');
  const tasksContainer = document.getElementById('tasksContainer');
  
  // Editor elements
  const taskNameInput = document.getElementById('taskName');
  const autoNameBtn = document.getElementById('autoNameBtn');
  const urlInput = document.getElementById('targetUrl');
  const timeInput = document.getElementById('targetTime');
  const advanceInput = document.getElementById('advanceSeconds');
  const delayInput = document.getElementById('delayMs');
  const maxRetriesInput = document.getElementById('maxRetries');
  const retryIntervalInput = document.getElementById('retryIntervalMs');
  const reloadOnRetryInput = document.getElementById('reloadOnRetry');
  
  const stepsContainer = document.getElementById('stepsContainer');
  const addStepBtn = document.getElementById('addStepBtn');
  const verifyBtn = document.getElementById('verifyBtn');
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  const scheduleBtn = document.getElementById('scheduleBtn');
  const backToListBtn = document.getElementById('backToListBtn');
  const createNewBtn = document.getElementById('createNewBtn');
  const statusDiv = document.getElementById('status');

  let tasks = [];
  let currentEditingTaskId = null;
  let selectors = [];

  // Initialize
  const data = await chrome.storage.local.get(['tasks', 'config']);
  if (data.tasks) {
    tasks = data.tasks;
  } else if (data.config) {
    // Migration from single config
    tasks = [{
      id: Date.now().toString(),
      url: data.config.url,
      selectors: data.config.selectors || [],
      targetTimeMs: data.config.targetTimeMs,
      advance: data.config.advance,
      delayMs: data.config.delayMs || 100,
      status: 'scheduled',
      maxRetries: 0,
      retryIntervalMs: 1000,
      reloadOnRetry: false
    }];
    await chrome.storage.local.set({ tasks });
  }

  // Auto-update URL logic
  async function updateUrlToCurrentTab() {
    if (editorView.style.display !== 'none' && !currentEditingTaskId) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
          urlInput.value = tab.url;
        }
      } catch (err) {}
    }
  }

  chrome.tabs.onActivated.addListener(() => updateUrlToCurrentTab());
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.url && !changeInfo.url.startsWith('chrome://')) {
      if (editorView.style.display !== 'none' && !currentEditingTaskId) {
        urlInput.value = changeInfo.url;
      }
    }
  });

  // Views
  function showListView() {
    listView.style.display = 'block';
    editorView.style.display = 'none';
    renderTasks();
  }

  function showEditorView(task = null) {
    listView.style.display = 'none';
    editorView.style.display = 'block';
    statusDiv.textContent = '';
    
    if (task) {
      currentEditingTaskId = task.id;
      taskNameInput.value = task.name || '';
      urlInput.value = task.url;
      selectors = [...task.selectors];
      if (task.targetTimeMs) {
        const d = new Date(task.targetTimeMs);
        const tzoffset = d.getTimezoneOffset() * 60000;
        timeInput.value = new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
      } else {
        timeInput.value = '';
      }
      advanceInput.value = task.advance || 5;
      delayInput.value = task.delayMs || 100;
      maxRetriesInput.value = task.maxRetries || 0;
      retryIntervalInput.value = task.retryIntervalMs || 1000;
      reloadOnRetryInput.checked = !!task.reloadOnRetry;
    } else {
      currentEditingTaskId = null;
      taskNameInput.value = '';
      urlInput.value = '';
      updateUrlToCurrentTab();
      selectors = [];
      const now = new Date();
      now.setMinutes(now.getMinutes() + 1);
      now.setSeconds(0);
      now.setMilliseconds(0);
      const tzoffset = now.getTimezoneOffset() * 60000;
      timeInput.value = new Date(now.getTime() - tzoffset).toISOString().slice(0, 16);
      advanceInput.value = 5;
      delayInput.value = 100;
      maxRetriesInput.value = 0;
      retryIntervalInput.value = 1000;
      reloadOnRetryInput.checked = false;
    }
    renderSteps();
  }

  function renderTasks() {
    tasksContainer.innerHTML = '';
    if (tasks.length === 0) {
      tasksContainer.innerHTML = '<div style="color:#9ca3af; font-size:12px; text-align:center; padding: 20px;">暂无任务</div>';
      return;
    }

    tasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'task-card';
      let statusClass = task.status === 'draft' ? 'status-draft' : task.status === 'scheduled' ? 'status-scheduled' : 'status-completed';
      let statusText = task.status === 'draft' ? '暂存' : task.status === 'scheduled' ? '已调度' : task.status === 'failed' ? '失败' : '完成';
      if (task.status === 'failed') statusClass = 'status-draft'; // reuse gray

      let timeText = task.targetTimeMs ? new Date(task.targetTimeMs).toLocaleString() : '未设置时间';

      card.innerHTML = `
        <div class="task-header">
          <div class="task-url" title="${task.url}">${task.name || task.url}</div>
          <div class="task-status ${statusClass}">${statusText}</div>
        </div>
        <div class="task-details">时间: ${timeText} | 步骤: ${task.selectors.length}</div>
        <div class="task-actions">
          <button class="btn-secondary edit-task-btn">编辑</button>
          <button class="btn-danger delete-task-btn">删除</button>
        </div>
      `;
      
      card.querySelector('.edit-task-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showEditorView(task);
      });
      card.querySelector('.delete-task-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('确认删除该任务吗？')) {
          tasks = tasks.filter(t => t.id !== task.id);
          await chrome.storage.local.set({ tasks });
          renderTasks();
          await chrome.runtime.sendMessage({ action: 'TASKS_UPDATED' });
        }
      });
      card.addEventListener('click', () => showEditorView(task));
      tasksContainer.appendChild(card);
    });
  }

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
        <input type="text" value="${sel}" data-index="${index}" class="step-input">
        <button type="button" class="btn-secondary locate-step-btn" data-index="${index}" title="在页面中高亮此元素" style="background:#e5e7eb; color:#4b5563;">🔍</button>
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
    document.querySelectorAll('.locate-step-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index);
        const selector = selectors[idx];
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && selector) {
          chrome.tabs.sendMessage(tab.id, { action: 'HIGHLIGHT_ELEMENT', selector }).catch(() => {});
        }
      });
    });
  }

  function showStatus(text, color) {
    statusDiv.style.color = color;
    statusDiv.textContent = text;
    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
  }

  async function saveTask(status) {
    document.querySelectorAll('.step-input').forEach(input => {
      const idx = parseInt(input.dataset.index);
      selectors[idx] = input.value.trim();
    });
    selectors = selectors.filter(s => s);

    if (!urlInput.value.trim()) {
      showStatus('请输入目标网址！', '#ef4444');
      return;
    }

    let name = taskNameInput.value.trim();
    if (!name) {
      showStatus('正在自动完善名称...', '#6b7280');
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
    const timeStr = timeInput.value;
    const advance = parseInt(advanceInput.value, 10) || 5;
    const delayMs = parseInt(delayInput.value, 10) || 100;
    const maxRetries = parseInt(maxRetriesInput.value, 10) || 0;
    const retryIntervalMs = parseInt(retryIntervalInput.value, 10) || 1000;
    const reloadOnRetry = reloadOnRetryInput.checked;

    if (!url) {
      showStatus('请输入目标网址！', '#ef4444');
      return;
    }

    let targetTimeMs = null;
    if (timeStr) {
      targetTimeMs = new Date(timeStr).getTime();
    }

    if (status === 'scheduled') {
      if (selectors.length === 0) {
        showStatus('调度任务必须包含至少一个步骤！', '#ef4444');
        return;
      }
      if (!targetTimeMs || targetTimeMs <= Date.now()) {
        showStatus('调度任务目标时间必须在未来！', '#ef4444');
        return;
      }
    }

    const newTask = {
      id: currentEditingTaskId || Date.now().toString(),
      name,
      url,
      selectors,
      targetTimeMs,
      advance,
      delayMs,
      status,
      maxRetries,
      retryIntervalMs,
      reloadOnRetry
    };

    if (currentEditingTaskId) {
      const idx = tasks.findIndex(t => t.id === currentEditingTaskId);
      if (idx !== -1) tasks[idx] = newTask;
      else tasks.push(newTask);
    } else {
      tasks.push(newTask);
    }

    await chrome.storage.local.set({ tasks });
    await chrome.runtime.sendMessage({ action: 'TASKS_UPDATED' });
    
    showStatus('保存成功！', '#10b981');
    setTimeout(() => {
      showListView();
    }, 1000);
  }

  saveDraftBtn.addEventListener('click', () => saveTask('draft'));
  scheduleBtn.addEventListener('click', () => saveTask('scheduled'));

  addStepBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    // Auto-save picking state to storage if we are creating/editing a task
    chrome.storage.local.get('pickingState', (d) => {
      chrome.storage.local.set({ pickingState: { selectors }});
    });

    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'START_PICKING' });
    } catch (err) {
      showStatus('请先刷新左侧网页，或确保网页允许注入脚本。', '#ef4444');
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

    verifyBtn.textContent = '刷新...';
    verifyBtn.disabled = true;

    try {
      await chrome.tabs.reload(tab.id);
      
      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          // 等待页面完全渲染和 content.js 注入
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'VERIFY_SEQUENCE', selectors, delayMs: parseInt(delayInput.value) || 100 }).catch(()=>{});
            verifyBtn.textContent = '验证序列';
            verifyBtn.disabled = false;
          }, 1500);
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (err) {
      showStatus('刷新失败。', '#ef4444');
      verifyBtn.textContent = '验证序列';
      verifyBtn.disabled = false;
    }
  });

  autoNameBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    autoNameBtn.textContent = '...';
    try {
      // 传递当前录制的步骤数组
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

  // Return to list
  backToListBtn.addEventListener('click', showListView);
  createNewBtn.addEventListener('click', () => showEditorView(null));

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SELECTOR_PICKED') {
      selectors.push(message.selector);
      renderSteps();
    }
  });

  // Start
  showListView();
});
