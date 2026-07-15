chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

async function scheduleAllTasks() {
  const { tasks } = await chrome.storage.local.get('tasks');
  if (!tasks) return;

  const now = Date.now();
  await chrome.alarms.clearAll();

  for (const task of tasks) {
    if (task.status === 'scheduled' && task.targetTimeMs) {
      const openTime = task.targetTimeMs - (task.advance * 1000);
      if (openTime > now) {
        await chrome.alarms.create(`openTask_${task.id}`, { when: openTime });
        console.log(`[MiaoBuy] Task ${task.id} scheduled for ${new Date(openTime).toLocaleString()}`);
      } else if (task.targetTimeMs > now) {
        // Already within advance window, open immediately
        await openTargetPage(task.url);
      }
    }
  }
}

async function openTargetPage(url) {
  const tabs = await chrome.tabs.query({ url: "*://*/*" });
  for (const tab of tabs) {
    if (tab.url.startsWith(url) || url.startsWith(tab.url)) {
      await chrome.tabs.update(tab.id, { active: true });
      return;
    }
  }
  await chrome.tabs.create({ url });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'TASKS_UPDATED') {
    (async () => {
      try {
        await scheduleAllTasks();
        sendResponse({ success: true });
      } catch (err) {
        console.error(err);
        sendResponse({ success: false, error: err.toString() });
      }
    })();
    return true; 
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('openTask_')) {
    const taskId = alarm.name.replace('openTask_', '');
    const { tasks } = await chrome.storage.local.get('tasks');
    const task = tasks?.find(t => t.id === taskId);
    if (task) {
      console.log(`[MiaoBuy] Alarm triggered for task ${taskId}. Opening ${task.url}`);
      await openTargetPage(task.url);
    }
  }
});

chrome.runtime.onStartup.addListener(() => scheduleAllTasks());
chrome.runtime.onInstalled.addListener(() => scheduleAllTasks());
