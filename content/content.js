(async function() {
  // Check config for polling
  const { config } = await chrome.storage.local.get('config');
  if (config) {
    startAutoBuyPolling(config);
  }

  function startAutoBuyPolling(config) {
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

    const { targetTimeMs, selectors, delayMs = 100 } = config;
    if (!selectors || selectors.length === 0) return;
    
    // Resume from where we left off (supports cross-page navigation)
    let currentStepIndex = config.currentStepIndex || 0;
    
    if (currentStepIndex >= selectors.length) {
      console.log(`[MiaoBuy] 所有步骤均已执行完毕！`);
      return;
    }

    console.log(`[MiaoBuy] 抢购任务加载，目标时间：${new Date(targetTimeMs).toLocaleString()}，步骤进度：${currentStepIndex + 1}/${selectors.length}`);

    let attemptCount = 0;
    const maxAttempts = 5000; // allow more frames since page loading could take a bit

    let isWaitingDelay = false;

    function checkAndClick() {
      if (currentStepIndex >= selectors.length) return;
      if (isWaitingDelay) {
        requestAnimationFrame(checkAndClick);
        return;
      }
      
      const now = Date.now();
      
      // If we are on step 0, wait for target time. If we are on step > 0, execute immediately once element is found
      if (currentStepIndex === 0 && now < targetTimeMs) {
        requestAnimationFrame(checkAndClick);
        return;
      }

      const selector = selectors[currentStepIndex];
      const el = document.querySelector(selector);
      
      if (el) {
        console.log(`[MiaoBuy] 第 ${currentStepIndex + 1} 步：找到目标元素 ${selector}，执行点击！时间差：${now - targetTimeMs}ms`);
        el.click();
        
        currentStepIndex++;
        
        // Save progress to handle cross-page navigation
        chrome.storage.local.get('config', (data) => {
          if (data.config) {
            data.config.currentStepIndex = currentStepIndex;
            chrome.storage.local.set({ config: data.config });
          }
        });

        if (currentStepIndex < selectors.length) {
          isWaitingDelay = true;
          setTimeout(() => {
            isWaitingDelay = false;
          }, delayMs);
          attemptCount = 0; // reset attempt count for next step
          requestAnimationFrame(checkAndClick);
        } else {
          console.log(`[MiaoBuy] 所有步骤均已成功执行完毕！`);
        }
      } else {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          requestAnimationFrame(checkAndClick);
        } else {
          console.log(`[MiaoBuy] 第 ${currentStepIndex + 1} 步：超过最大尝试次数，未能找到元素 ${selector}，停止。`);
        }
      }
    }
    // Start polling
    requestAnimationFrame(checkAndClick);
  }

  // --- Element Picking & Replay Logic ---
  let isPicking = false;

  function generateCssPath(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + CSS.escape(el.id);
        path.unshift(selector);
        break; // ID is usually unique enough
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() == selector) nth++;
        }
        if (nth != 1) selector += ":nth-of-type(" + nth + ")";
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  function handleMouseOver(e) {
    if (!isPicking) return;
    e.target.classList.add('miaobuy-picking-highlight');
  }

  function handleMouseOut(e) {
    if (!isPicking) return;
    e.target.classList.remove('miaobuy-picking-highlight');
  }

  function handleClick(e) {
    if (!isPicking) return;
    e.preventDefault();
    e.stopPropagation();

    e.target.classList.remove('miaobuy-picking-highlight');
    const selector = generateCssPath(e.target);
    
    // Stop picking
    isPicking = false;
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);

    // Save to storage so popup can load it next time it opens
    chrome.storage.local.get('config', (data) => {
      const newConfig = data.config || {};
      if (!newConfig.selectors) newConfig.selectors = [];
      newConfig.selectors.push(selector);
      chrome.storage.local.set({ config: newConfig });
    });

    // Send message to popup in case it's still open
    chrome.runtime.sendMessage({ action: 'SELECTOR_PICKED', selector });
    
    // Visual feedback
    alert(`[MiaoBuy] 已拾取步骤：\n${selector}\n请重新打开扩展图标查看并保存。`);
  }

  function startPicking() {
    if (isPicking) return;
    isPicking = true;
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
  }

  async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function verifySequence(selectors) {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const el = document.querySelector(selector);
      if (!el) {
        alert(`[MiaoBuy] 第 ${i + 1} 步中断：未能在页面上找到元素\n${selector}`);
        return;
      }
      
      // Scroll into view
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400); // Wait for scroll
      
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2 + window.scrollX;
      const targetY = rect.top + rect.height / 2 + window.scrollY;

      // Create cursor if not exists
      let cursor = document.getElementById('miaobuy-simulated-cursor');
      let startX, startY;
      
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'miaobuy-simulated-cursor';
        cursor.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill: black; stroke: white;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>`;
        document.body.appendChild(cursor);
        startX = window.innerWidth - 100 + window.scrollX;
        startY = window.innerHeight - 100 + window.scrollY;
        cursor.style.transition = 'none';
        cursor.style.transform = `translate(${startX}px, ${startY}px)`;
        cursor.offsetHeight; // Force reflow
      }

      // Move to target
      cursor.style.transition = 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
      cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;

      await sleep(650); // Wait for move to finish

      // Show ripple
      const ripple = document.createElement('div');
      ripple.className = 'miaobuy-ripple';
      ripple.style.left = targetX - 20 + 'px'; // 40x40 size, center is at 20
      ripple.style.top = targetY - 20 + 'px';
      document.body.appendChild(ripple);

      setTimeout(() => { ripple.remove(); }, 600);
      
      // Wait before next step
      await sleep(600);
    }
    
    // Remove cursor after sequence
    const finalCursor = document.getElementById('miaobuy-simulated-cursor');
    if (finalCursor) finalCursor.remove();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_PICKING') {
      startPicking();
      sendResponse({ success: true });
    } else if (message.action === 'VERIFY_SEQUENCE') {
      verifySequence(message.selectors);
      sendResponse({ success: true });
    }
  });

})();
