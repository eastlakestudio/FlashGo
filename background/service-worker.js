// Polyfill for alarms if needed
const ALARM_PREFIX = 'miaobuy-task-';

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

function scheduleAllTasks() {
  chrome.alarms.clearAll(() => {
    chrome.storage.local.get('tasks', (data) => {
      const tasks = data.tasks || [];
      const now = Date.now();

      let totalTasks = tasks.length;
      let scheduledCount = 0;
      let expiredCount = 0;
      let nextTaskInfo = null;

      let changed = false;

      tasks.forEach(task => {
        if (task.status === 'failed' || task.status === 'completed') {
          expiredCount++;
        }

        if (task.status === 'scheduled') {
          let targetMs = null;
          
          if (task.scheduleType === 'recurring') {
            targetMs = getNextRecurringTime(task.recurringTime, task.recurringDays);
          } else {
            targetMs = task.targetTimeMs;
          }

          if (targetMs && targetMs > now) {
            scheduledCount++;
            if (!nextTaskInfo || targetMs < nextTaskInfo.time) {
              nextTaskInfo = { time: targetMs, name: task.name || task.url };
            }

            const advance = (task.advanceSeconds || 5) * 1000;
            const openTime = targetMs - advance;
            
            if (openTime > now) {
              chrome.alarms.create(ALARM_PREFIX + task.id, { when: openTime });
            } else {
              openTargetPage(task.url, task.id);
            }
          } else {
            if (task.scheduleType === 'once') {
              task.status = 'failed'; 
              changed = true;
              expiredCount++;
            }
          }
        }
      });

      if (changed) {
        chrome.storage.local.set({ tasks });
      }

      // Update Toolbar Icon Title (Tooltip)
      let titleStr = `🛒 MiaoBuy 抢购管家\n\n📊 任务概览：\n • 总任务数：${totalTasks}\n • 等待执行：${scheduledCount}\n • 已过期/失败：${expiredCount}`;
      if (nextTaskInfo) {
        // 格式化时间，去掉秒
        const d = new Date(nextTaskInfo.time);
        const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        titleStr += `\n\n⏰ 下次启动：\n 📅 时间：${timeStr}\n 🎯 任务：${nextTaskInfo.name}`;
      } else {
        titleStr += `\n\n⏰ 下次启动：\n 无待办任务`;
      }
      chrome.action.setTitle({ title: titleStr });
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    const taskId = alarm.name.replace(ALARM_PREFIX, '');
    chrome.storage.local.get('tasks', (data) => {
      const tasks = data.tasks || [];
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        openTargetPage(task.url, task.id);
      }
    });
  }
});

function openTargetPage(url, taskId) {
  chrome.tabs.query({}, (tabs) => {
    let existingTab = tabs.find(tab => tab.url && tab.url.includes(url));
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true });
      chrome.windows.update(existingTab.windowId, { focused: true });
    } else {
      chrome.tabs.create({ url, active: true });
    }
  });
}

// Side Panel Activation
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Re-evaluate schedules when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tasks) {
    scheduleAllTasks();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'GET_ACTIVE_TASK') {
    chrome.storage.local.get('tasks', (data) => {
      const tasks = data.tasks || [];
      // 找到一个调度中、且当前在目标时间前后的任务
      const now = Date.now();
      const activeTask = tasks.find(t => {
        if (t.status !== 'scheduled' || !sender.tab || !sender.tab.url) return false;
        if (!sender.tab.url.includes(t.url)) return false;
        
        let targetMs = null;
        if (t.scheduleType === 'recurring') {
           // 由于 content.js 获取时已经是在执行期，当前时间可能比计算出的 next time 早几秒或晚几秒
           // 对于循环任务，我们只要判断当前时间是否在其触发时间范围内容即可
           // 这里简化处理：直接传回 task，由 content.js 执行
           return true; 
        } else {
           targetMs = t.targetTimeMs;
        }

        if (!targetMs) return false;
        const advance = (t.advanceSeconds || 5) * 1000;
        // 如果当前时间处于 提前打开 到 目标时间+5分钟 内，认为激活
        return now >= (targetMs - advance - 5000) && now <= (targetMs + 5 * 60000);
      });
      
      if (activeTask) {
        // 如果是单次任务，直接传递 targetTimeMs，若是循环任务，需根据当前时间推算今日的目标毫秒数供 content 等待
        let exactTargetMs = activeTask.targetTimeMs;
        if (activeTask.scheduleType === 'recurring' && activeTask.recurringTime) {
           const [h, m] = activeTask.recurringTime.split(':').map(Number);
           const d = new Date();
           d.setHours(h, m, 0, 0);
           exactTargetMs = d.getTime();
        }
        activeTask.targetTimeMs = exactTargetMs; // overwrite for content.js
        sendResponse({ task: activeTask });
      } else {
        sendResponse({ task: null });
      }
    });
    return true; 
  } else if (message.action === 'NOTIFY_SUCCESS') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // Placeholder 1x1 image
      title: '抢购大捷！',
      message: message.text || '端侧 AI 判定：已为您成功抢到商品，请尽快前往付款！',
      priority: 2
    });
    // 成功后触发一次重新计算，循环任务会算出下一次的时间
    scheduleAllTasks();
    sendResponse({ success: true });
  }
});

// Init on boot
scheduleAllTasks();
