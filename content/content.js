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
            requestAnimationFrame(checkAndClick);
          } else {
            console.log(`[MiaoBuy] 超过最大尝试次数，未能找到元素 ${selector}`);
          }
        }
      } else {
        requestAnimationFrame(checkAndClick);
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
      newConfig.selector = selector;
      chrome.storage.local.set({ config: newConfig });
    });

    // Send message to popup in case it's still open
    chrome.runtime.sendMessage({ action: 'SELECTOR_PICKED', selector });
    
    // Visual feedback
    alert(`[MiaoBuy] 已选取选择器：\n${selector}\n请重新打开扩展图标以查看。`);
  }

  function startPicking() {
    if (isPicking) return;
    isPicking = true;
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
  }

  function verifySelector(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      alert(`[MiaoBuy] 未能在页面上找到元素：${selector}`);
      return;
    }
    
    // Scroll into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2 + window.scrollX;
      const targetY = rect.top + rect.height / 2 + window.scrollY;

      // Create cursor
      let cursor = document.getElementById('miaobuy-simulated-cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'miaobuy-simulated-cursor';
        cursor.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill: black; stroke: white;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>`;
        document.body.appendChild(cursor);
      }

      // Initial pos (bottom right of the window)
      const startX = window.innerWidth - 100 + window.scrollX;
      const startY = window.innerHeight - 100 + window.scrollY;
      
      cursor.style.transition = 'none';
      cursor.style.transform = `translate(${startX}px, ${startY}px)`;
      
      // Force reflow
      cursor.offsetHeight;

      // Move to target
      cursor.style.transition = 'transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)';
      cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;

      // After move completes, show ripple
      setTimeout(() => {
        const ripple = document.createElement('div');
        ripple.className = 'miaobuy-ripple';
        ripple.style.left = targetX - 20 + 'px'; // 40x40 size, center is at 20
        ripple.style.top = targetY - 20 + 'px';
        document.body.appendChild(ripple);

        setTimeout(() => {
          ripple.remove();
          setTimeout(() => cursor.remove(), 500);
        }, 600);
      }, 800); // Wait for transition
    }, 500); // Wait for scroll
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_PICKING') {
      startPicking();
      sendResponse({ success: true });
    } else if (message.action === 'VERIFY_SELECTOR') {
      verifySelector(message.selector);
      sendResponse({ success: true });
    }
  });

})();
