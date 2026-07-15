(async function() {
  // Check config
  const { config } = await chrome.storage.local.get('config');
  if (!config) return;

  const currentUrl = window.location.href;
  let configUrlObj;
  try {
    configUrlObj = new URL(config.url);
  } catch (e) {
    return;
  }
  
  const currentUrlObj = new URL(currentUrl);
  
  // Basic match: host and path
  if (configUrlObj.host !== currentUrlObj.host || configUrlObj.pathname !== currentUrlObj.pathname) {
    return;
  }

  const { targetTimeMs, selector } = config;

  console.log(`[MiaoBuy] 抢购任务加载，目标时间：${new Date(targetTimeMs).toLocaleString()}，选择器：${selector}`);

  let clicked = false;
  let attemptCount = 0;
  const maxAttempts = 1000; // After target time, try 1000 times max

  function checkAndClick() {
    if (clicked) return;
    
    const now = Date.now();
    if (now >= targetTimeMs) {
      // Time is up! Try to click
      const el = document.querySelector(selector);
      if (el) {
        console.log(`[MiaoBuy] 找到目标元素，执行点击！时间差：${now - targetTimeMs}ms`);
        el.click();
        clicked = true;
      } else {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          // Check again next frame
          requestAnimationFrame(checkAndClick);
        } else {
          console.log(`[MiaoBuy] 超过最大尝试次数，未能找到元素 ${selector}`);
        }
      }
    } else {
      // Time not yet up, check again next frame
      requestAnimationFrame(checkAndClick);
    }
  }

  // Start polling
  requestAnimationFrame(checkAndClick);
})();
