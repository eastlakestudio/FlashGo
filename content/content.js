(async function() {
  const { tasks, runningState } = await chrome.storage.local.get(['tasks', 'runningState']);
  if (tasks && tasks.length > 0) {
    startAutoBuyEngine(tasks, runningState || {});
  }

  function startAutoBuyEngine(tasks, globalState) {
    const currentUrl = window.location.href;
    const currentUrlObj = new URL(currentUrl);

    // Find the first scheduled task that matches the URL
    let activeTask = null;
    let activeTaskId = null;
    let currentStepIndex = 0;
    let currentRetryCount = 0;

    for (const task of tasks) {
      if (task.status !== 'scheduled') continue;
      try {
        const configUrlObj = new URL(task.url);
        if (configUrlObj.host === currentUrlObj.host && configUrlObj.pathname === currentUrlObj.pathname) {
          activeTask = task;
          activeTaskId = task.id;
          if (globalState[task.id]) {
            currentStepIndex = globalState[task.id].currentStepIndex || 0;
            currentRetryCount = globalState[task.id].currentRetryCount || 0;
          }
          break; // take first matched
        }
      } catch (e) {}
    }

    if (!activeTask) return;

    const { targetTimeMs, selectors, delayMs = 100, maxRetries = 0, retryIntervalMs = 1000, reloadOnRetry = false } = activeTask;
    if (!selectors || selectors.length === 0) return;
    
    if (currentStepIndex >= selectors.length) {
      console.log(`[FlashGo] 任务 ${activeTaskId} 所有步骤均已执行完毕！`);
      return;
    }

    console.log(`[FlashGo] 引擎启动，任务：${activeTaskId}，进度：${currentStepIndex + 1}/${selectors.length}，重试：${currentRetryCount}/${maxRetries}`);

    let hasNotifiedStart = false;
    let isWaitingDelay = false;
    let stepStartTime = Date.now();
    const TIMEOUT_MS = 15000; // 增加到 15 秒，避免慢速网页导致误判

    function updateState(step, retry) {
      return new Promise(resolve => {
        chrome.storage.local.get('runningState', (data) => {
          const st = data.runningState || {};
          st[activeTaskId] = { currentStepIndex: step, currentRetryCount: retry };
          chrome.storage.local.set({ runningState: st }, resolve);
        });
      });
    }

    async function handleFailure() {
      console.warn(`[FlashGo] 步骤 ${currentStepIndex + 1} 寻找超时！`);
      if (currentRetryCount < maxRetries) {
        const nextRetry = currentRetryCount + 1;
        console.log(`[FlashGo] 准备第 ${nextRetry} 次重试...`);
        await updateState(0, nextRetry);
        
        if (reloadOnRetry) {
          console.log(`[FlashGo] 正在刷新页面重试...`);
          window.location.reload();
        } else {
          setTimeout(() => {
            currentStepIndex = 0;
            currentRetryCount = nextRetry;
            stepStartTime = Date.now();
            requestAnimationFrame(checkAndClick);
          }, retryIntervalMs);
        }
      } else {
        console.error(`[FlashGo] 达到最大重试次数，任务失败退出。`);
        chrome.storage.local.get('tasks', (data) => {
          const tks = data.tasks || [];
          const t = tks.find(x => x.id === activeTaskId);
          if (t) { t.status = 'failed'; chrome.storage.local.set({ tasks: tks }); }
        });
      }
    }

    function checkAndClick() {
      if (currentStepIndex >= selectors.length) return;
      if (isWaitingDelay) {
        requestAnimationFrame(checkAndClick);
        return;
      }
      
      const now = Date.now();
      
      if (currentStepIndex === 0 && targetTimeMs && now < targetTimeMs) {
        stepStartTime = now; // keep resetting start time while waiting for scheduled time
        requestAnimationFrame(checkAndClick);
        return;
      }

      if (!hasNotifiedStart && currentStepIndex === 0 && currentRetryCount === 0) {
        hasNotifiedStart = true;
        chrome.runtime.sendMessage({ 
          action: 'NOTIFY_STATUS', 
          status: '正在执行', 
          taskName: activeTask.name || activeTask.url 
        });
      }

      // 等待 DOM 基本加载完成，再开始计算超时时间
      if (document.readyState !== 'complete') {
        stepStartTime = now;
      }

      if (now - stepStartTime > TIMEOUT_MS) {
        handleFailure();
        return;
      }

      const selector = selectors[currentStepIndex];
      const el = document.querySelector(selector);
      
      if (el) {
        console.log(`[FlashGo] 触发步骤 ${currentStepIndex + 1}：${selector}`);
        el.click();
        
        currentStepIndex++;
        updateState(currentStepIndex, currentRetryCount);

        if (currentStepIndex < selectors.length) {
          isWaitingDelay = true;
          stepStartTime = now + delayMs; // Reset timeout counter
          setTimeout(() => {
            isWaitingDelay = false;
          }, delayMs);
          requestAnimationFrame(checkAndClick);
        } else {
          // 所有步骤点击完毕，进入校验阶段
          console.log(`[FlashGo] 所有步骤点击完毕，准备使用 AI 校验结果...`);
          chrome.runtime.sendMessage({ 
            action: 'NOTIFY_STATUS', 
            status: '执行识别', 
            taskName: activeTask.name || activeTask.url 
          });
          setTimeout(async () => {
            const pageText = document.body.innerText.substring(0, 3000); // 截取前3000字符
            let isSuccess = false;

            try {
              const prompt = `根据以下网页文本，判断用户的抢购/下单是否成功？(成功特征：去支付、提交成功、订单号等；失败特征：售罄、拥挤、失败、重试、无货等)。\n请仅回答 YES 或 NO。\n\n文本：${pageText}`;
              console.log(`[FlashGo] 🤖 AI 裁判输入 (Prompt):\n`, prompt);
              const aiResponse = await chrome.runtime.sendMessage({ action: 'CALL_AI_MAIN_WORLD', prompt: prompt });
              if (aiResponse && aiResponse.result) {
                let result = aiResponse.result;
                console.log(`[FlashGo] 🤖 AI 裁判输出 (Result):\n`, result);
                if (result.toUpperCase().includes('YES')) {
                  isSuccess = true;
                }
              } else {
                console.log(`[FlashGo] 未检测到本地 AI，使用降级逻辑判定。`);
                // 降级：正则匹配
                if (/(成功|去支付|订单|付款|支付|提交完成)/i.test(pageText) && !/(售罄|无货|拥挤|失败|重试|报错)/i.test(pageText)) {
                  isSuccess = true;
                }
              }
            } catch (err) {
              console.error(`[FlashGo] AI 校验报错，降级处理。`, err);
            }

            if (isSuccess) {
              console.log(`[FlashGo] 校验通过！任务完美执行完毕！`);
              updateState(0, 0);
              chrome.storage.local.get('tasks', (data) => {
                const tks = data.tasks || [];
                const t = tks.find(x => x.id === activeTaskId);
                if (t) {
                  if (t.scheduleType === 'once' || !t.scheduleType) {
                    t.status = 'completed'; 
                  }
                  // 如果是 recurring，则维持 scheduled 状态，由后台重新排期
                  chrome.storage.local.set({ tasks: tks }); 
                }
              });
              // 呼叫后台弹出系统通知（并触发重新排期）
              chrome.runtime.sendMessage({ 
                action: 'NOTIFY_SUCCESS', 
                taskName: activeTask.name || activeTask.url 
              });
            } else {
              console.log(`[FlashGo] 校验未通过（疑似失败/拥挤），触发重试机制！`);
              currentStepIndex = selectors.length; // 使得 handleFailure 认为我们在最后一步超时
              handleFailure();
            }
          }, 2000); // 额外等待 2 秒让结果渲染
        }
      } else {
        requestAnimationFrame(checkAndClick);
      }
    }
    requestAnimationFrame(checkAndClick);
  }

  // --- Element Picking & Replay Logic ---
  let isPicking = false;
  let pickingOverlay = null;
  let lastHighlightedEl = null;

  function generateCssPath(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + CSS.escape(el.id);
        path.unshift(selector);
        break; 
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

  function handleOverlayMouseMove(e) {
    if (!isPicking) return;
    pickingOverlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    pickingOverlay.style.pointerEvents = 'auto';

    if (el && el !== lastHighlightedEl) {
      if (lastHighlightedEl) lastHighlightedEl.classList.remove('flashgo-picking-highlight');
      el.classList.add('flashgo-picking-highlight');
      lastHighlightedEl = el;
    }
  }

  let pickModeBadge = null;

  function showPickBadge() {
    if (pickModeBadge) return;
    pickModeBadge = document.createElement('div');
    pickModeBadge.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 9999999;
      background: #4f46e5; color: white; padding: 10px 24px; border-radius: 8px; font-size: 14px;
      font-weight: 600; font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2); pointer-events: none;
    `;
    pickModeBadge.textContent = "FlashGo 连续拾取模式：点击元素添加，按 Esc 键退出";
    document.body.appendChild(pickModeBadge);
  }

  function hidePickBadge() {
    if (pickModeBadge) {
      pickModeBadge.remove();
      pickModeBadge = null;
    }
  }

  function stopPicking() {
    if (!isPicking) return;
    isPicking = false;
    if (pickingOverlay) {
      pickingOverlay.remove();
      pickingOverlay = null;
    }
    if (lastHighlightedEl) {
      lastHighlightedEl.classList.remove('flashgo-picking-highlight');
      lastHighlightedEl = null;
    }
    hidePickBadge();
    document.removeEventListener('keydown', handlePickKeydown, true);
  }

  function handlePickKeydown(e) {
    if (e.key === 'Escape') {
      stopPicking();
    }
  }

  function handleOverlayClick(e) {
    if (!isPicking) return;
    e.preventDefault();
    e.stopPropagation();

    pickingOverlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    pickingOverlay.style.pointerEvents = 'auto';

    if (el) {
      // 拾取成功视觉反馈（绿色闪烁）
      const oldOutline = el.style.outline;
      const oldTransition = el.style.transition;
      el.style.transition = 'outline 0.1s ease';
      el.style.outline = '4px solid #10b981';
      setTimeout(() => {
        el.style.outline = oldOutline;
        el.style.transition = oldTransition;
      }, 300);

      const selector = generateCssPath(el);
      chrome.runtime.sendMessage({ action: 'SELECTOR_PICKED', selector });
    }
  }

  function startPicking() {
    if (isPicking) return;
    isPicking = true;
    pickingOverlay = document.createElement('div');
    pickingOverlay.id = 'flashgo-picking-overlay';
    document.body.appendChild(pickingOverlay);
    pickingOverlay.addEventListener('mousemove', handleOverlayMouseMove, true);
    pickingOverlay.addEventListener('click', handleOverlayClick, true);
    
    document.addEventListener('keydown', handlePickKeydown, true);
    showPickBadge();
  }

  async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  
  const HIGHLIGHT_DURATION = 1500;

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 999999;
    background: #3b82f6; color: white; padding: 12px 20px; border-radius: 8px;
    font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s; opacity: 0; pointer-events: none;
  `;
  toast.textContent = chrome.i18n.getMessage('startRunning') || 'FlashGo: Started...';

  function showToast(msg, isError = false) {
    if (!toast.parentNode && document.body) {
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? '#ef4444' : '#3b82f6';
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 3000);
  }

  // UI Notification for Success
  function showSuccessToast() {
    const successBox = document.createElement('div');
    successBox.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      z-index: 999999; background: #10b981; color: white; padding: 24px 40px;
      border-radius: 12px; font-size: 24px; font-weight: bold; font-family: sans-serif;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4); text-align: center;
    `;
    successBox.innerHTML = chrome.i18n.getMessage('buySuccess') || '🎉 Success!';
    document.body.appendChild(successBox);
    setTimeout(() => successBox.remove(), 6000);
  }

  async function waitForElement(selector, timeoutMs = 5000) {
    const start = Date.now();
    return new Promise(resolve => {
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeoutMs) return resolve(null);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async function verifySequence(selectors, delayMs) {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const el = await waitForElement(selector, 8000); // 最多等8秒
      if (!el) {
        alert(`[FlashGo] 第 ${i + 1} 步中断：未能在页面上找到元素\n${selector}`);
        return;
      }
      
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400); 
      
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2 + window.scrollX;
      const targetY = rect.top + rect.height / 2 + window.scrollY;

      let cursor = document.getElementById('flashgo-simulated-cursor');
      let startX, startY;
      
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'flashgo-simulated-cursor';
        cursor.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill: black; stroke: white;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path></svg>`;
        document.body.appendChild(cursor);
        startX = window.innerWidth - 100 + window.scrollX;
        startY = window.innerHeight - 100 + window.scrollY;
        cursor.style.transition = 'none';
        cursor.style.transform = `translate(${startX}px, ${startY}px)`;
        cursor.offsetHeight; // reflow
      }

      // Dynamic move timing based on relative delay, max 0.8s for visual
      const moveTime = Math.min(0.8, delayMs / 1000);
      cursor.style.transition = `transform ${moveTime}s cubic-bezier(0.25, 1, 0.5, 1)`;
      cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;

      await sleep(moveTime * 1000 + 50); 

      // Ripple
      const ripple = document.createElement('div');
      ripple.className = 'flashgo-ripple';
      ripple.style.left = targetX + 'px'; 
      ripple.style.top = targetY + 'px';
      document.body.appendChild(ripple);

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'flashgo-tooltip';
      tooltip.style.left = targetX + 'px';
      tooltip.style.top = targetY + 'px';
      tooltip.innerText = `Click ${i + 1}`;
      document.body.appendChild(tooltip);

      setTimeout(() => { ripple.remove(); }, 600);
      setTimeout(() => { tooltip.remove(); }, 600);
      
      await sleep(delayMs);
    }
    
    const finalCursor = document.getElementById('flashgo-simulated-cursor');
    if (finalCursor) finalCursor.remove();
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_PICKING') {
      startPicking();
      sendResponse({ success: true });
    } else if (message.action === 'VERIFY_SEQUENCE') {
      verifySequence(message.selectors, message.delayMs || 600);
      sendResponse({ success: true });
    } else if (message.action === 'HIGHLIGHT_ELEMENT') {
      const el = document.querySelector(message.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flashgo-locate-highlight');
        void el.offsetWidth; // trigger reflow
        el.classList.add('flashgo-locate-highlight');
        setTimeout(() => el.classList.remove('flashgo-locate-highlight'), 1500);
      }
      sendResponse({ success: true });
    } else if (message.action === 'GENERATE_TASK_NAME') {
      (async () => {
        try {
            let stepsContext = '';
            if (message.selectors && message.selectors.length > 0) {
              const elementTexts = message.selectors.map(sel => {
                const el = document.querySelector(sel);
                const text = el ? (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().substring(0, 50) : '';
                return el ? `选择器: ${sel} | 按钮文本: "${text || '无明显文本'}"` : `选择器: ${sel}`;
              });
              stepsContext = `用户试图按顺序点击页面上的这些按钮/元素：\n${elementTexts.join('\n')}\n请结合这些按钮上的文字推测用户的最终目的。`;
            }
            const prompt = `你是一个命名助手。请根据网页标题、全文摘要以及用户试图点击的按钮文字，提取最核心的品牌/商品/服务，生成一个简短的“任务名称”。
要求：
1. 格式必须是：“[核心商品/服务名]抢购” 或 “[核心动作/服务名]预约”。
2. 例子：如果网页是智谱GLM的计划购买页，输出“智谱CodingPlan抢购”。
3. 极度精简，限制在12个字符以内。
4. 仅输出名称，绝不包含任何多余标点、符号或解释文字。

网页标题：${document.title}
网页全文摘要：${document.body.innerText.substring(0, 3000)}

${stepsContext}`;
            console.log(`[FlashGo] 🤖 AI 命名输入 (Prompt):\n`, prompt);
            const aiResponse = await chrome.runtime.sendMessage({ action: 'CALL_AI_MAIN_WORLD', prompt: prompt });
            if (aiResponse && aiResponse.result) {
              let name = aiResponse.result;
              console.log(`[FlashGo] 🤖 AI 命名输出 (Result):\n`, name);
              name = name.replace(/["'\\[\\]\n]/g, '').trim();
              sendResponse({ name: name || document.title.substring(0, 15) });
            } else {
              console.warn(`[FlashGo] 未检测到 window.ai，回退到网页标题。`);
              sendResponse({ name: document.title.substring(0, 15) });
            }
        } catch (e) {
          console.error(`[FlashGo] 🤖 AI 命名失败:`, e);
          sendResponse({ name: document.title.substring(0, 15) });
        }
      })();
      return true; // indicate async response
    }
  });

})();
