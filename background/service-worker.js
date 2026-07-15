async function scheduleTask() {
  const { config } = await chrome.storage.local.get('config');
  if (!config) return;

  const now = Date.now();
  const targetTime = config.targetTimeMs;
  const advanceMs = config.advance * 1000;
  const openTime = targetTime - advanceMs;

  await chrome.alarms.clear('openPageAlarm');

  if (openTime > now) {
    await chrome.alarms.create('openPageAlarm', { when: openTime });
    console.log(`Alarm set for ${new Date(openTime).toLocaleString()}`);
  } else if (targetTime > now) {
    // If it's already past the advance time but before target, open immediately
    await openTargetPage(config.url);
  }
}

async function openTargetPage(url) {
  // Check if already open
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
  if (message.action === 'SCHEDULE_TASK') {
    (async () => {
      try {
        await scheduleTask();
        sendResponse({ success: true });
      } catch (err) {
        console.error(err);
        sendResponse({ success: false, error: err.toString() });
      }
    })();
    return true; // Keep channel open for async
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'openPageAlarm') {
    const { config } = await chrome.storage.local.get('config');
    if (config) {
      console.log(`Alarm triggered. Opening ${config.url}`);
      await openTargetPage(config.url);
    }
  }
});

// Reschedule on startup
chrome.runtime.onStartup.addListener(() => {
  scheduleTask();
});
chrome.runtime.onInstalled.addListener(() => {
  scheduleTask();
});
