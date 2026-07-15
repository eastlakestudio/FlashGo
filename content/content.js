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
      console.log(`[MiaoBuy] 任务 ${activeTaskId} 所有步骤均已执行完毕！`);
      return;
    }

    console.log(`[MiaoBuy] 引擎启动，任务：${activeTaskId}，进度：${currentStepIndex + 1}/${selectors.length}，重试：${currentRetryCount}/${maxRetries}`);

    let isWaitingDelay = false;
    let stepStartTime = Date.now();
    const TIMEOUT_MS = 5000; // 5 seconds timeout per step

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
      console.warn(`[MiaoBuy] 步骤 ${currentStepIndex + 1} 寻找超时！`);
      if (currentRetryCount < maxRetries) {
        const nextRetry = currentRetryCount + 1;
        console.log(`[MiaoBuy] 准备第 ${nextRetry} 次重试...`);
        await updateState(0, nextRetry);
        
        if (reloadOnRetry) {
          console.log(`[MiaoBuy] 正在刷新页面重试...`);
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
        console.error(`[MiaoBuy] 达到最大重试次数，任务失败退出。`);
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

      if (now - stepStartTime > TIMEOUT_MS) {
        handleFailure();
        return;
      }

      const selector = selectors[currentStepIndex];
      const el = document.querySelector(selector);
      
      if (el) {
        console.log(`[MiaoBuy] 触发步骤 ${currentStepIndex + 1}：${selector}`);
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
          console.log(`[MiaoBuy] 所有步骤点击完毕，准备使用 AI 校验结果...`);
          setTimeout(async () => {
            const pageText = document.body.innerText.substring(0, 3000); // 截取前3000字符
            let isSuccess = false;

            try {
              // 尝试调用 Chrome 实验性端侧 AI
              const aiModel = window.ai?.languageModel || window.ai;
              if (aiModel) {
                console.log(`[MiaoBuy] 检测到本地 AI，正在调用...`);
                let session;
                if (typeof aiModel.create === 'function') {
                  session = await aiModel.create();
                } else if (typeof aiModel.createTextSession === 'function') {
                  session = await aiModel.createTextSession();
                }
                if (session) {
                  const prompt = `根据以下网页文本，判断用户的抢购/下单是否成功？(成功特征：去支付、提交成功、订单号等；失败特征：售罄、拥挤、失败、重试、无货等)。\n请仅回答 YES 或 NO。\n\n文本：${pageText}`;
                  const result = await session.prompt(prompt);
                  console.log(`[MiaoBuy] AI 判断结果:`, result);
                  if (result.toUpperCase().includes('YES')) {
                    isSuccess = true;
                  }
                }
              } else {
                console.log(`[MiaoBuy] 未检测到本地 AI，使用降级逻辑判定。`);
                // 降级：正则匹配
                if (/(成功|去支付|订单|付款|支付|提交完成)/i.test(pageText) && !/(售罄|无货|拥挤|失败|重试|报错)/i.test(pageText)) {
                  isSuccess = true;
                }
              }
            } catch (err) {
              console.error(`[MiaoBuy] AI 校验报错，降级处理。`, err);
            }

            if (isSuccess) {
              console.log(`[MiaoBuy] 校验通过！任务完美执行完毕！`);
              updateState(0, 0);
              chrome.storage.local.get('tasks', (data) => {
                const tks = data.tasks || [];
                const t = tks.find(x => x.id === activeTaskId);
                if (t) { t.status = 'completed'; chrome.storage.local.set({ tasks: tks }); }
              });
              // 呼叫后台弹出系统通知
              chrome.runtime.sendMessage({ action: 'NOTIFY_SUCCESS' });
            } else {
              console.log(`[MiaoBuy] 校验未通过（疑似失败/拥挤），触发重试机制！`);
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
      if (lastHighlightedEl) lastHighlightedEl.classList.remove('miaobuy-picking-highlight');
      el.classList.add('miaobuy-picking-highlight');
      lastHighlightedEl = el;
    }
  }

  function handleOverlayClick(e) {
    if (!isPicking) return;
    e.preventDefault();
    e.stopPropagation();

    pickingOverlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    
    if (lastHighlightedEl) lastHighlightedEl.classList.remove('miaobuy-picking-highlight');
    
    isPicking = false;
    pickingOverlay.remove();
    pickingOverlay = null;

    if (el) {
      const selector = generateCssPath(el);
      chrome.runtime.sendMessage({ action: 'SELECTOR_PICKED', selector });
    }
  }

  function startPicking() {
    if (isPicking) return;
    isPicking = true;
    pickingOverlay = document.createElement('div');
    pickingOverlay.id = 'miaobuy-picking-overlay';
    document.body.appendChild(pickingOverlay);
    pickingOverlay.addEventListener('mousemove', handleOverlayMouseMove, true);
    pickingOverlay.addEventListener('click', handleOverlayClick, true);
  }

  async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function verifySequence(selectors, delayMs) {
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const el = document.querySelector(selector);
      if (!el) {
        alert(`[MiaoBuy] 第 ${i + 1} 步中断：未能在页面上找到元素\n${selector}`);
        return;
      }
      
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(400); 
      
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2 + window.scrollX;
      const targetY = rect.top + rect.height / 2 + window.scrollY;

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
        cursor.offsetHeight; // reflow
      }

      // Dynamic move timing based on relative delay, max 0.8s for visual
      const moveTime = Math.min(0.8, delayMs / 1000);
      cursor.style.transition = `transform ${moveTime}s cubic-bezier(0.25, 1, 0.5, 1)`;
      cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;

      await sleep(moveTime * 1000 + 50); 

      // Ripple
      const ripple = document.createElement('div');
      ripple.className = 'miaobuy-ripple';
      ripple.style.left = targetX + 'px'; 
      ripple.style.top = targetY + 'px';
      document.body.appendChild(ripple);

      // Tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'miaobuy-tooltip';
      tooltip.style.left = targetX + 'px';
      tooltip.style.top = targetY + 'px';
      tooltip.innerText = `Click ${i + 1}`;
      document.body.appendChild(tooltip);

      setTimeout(() => { ripple.remove(); }, 600);
      setTimeout(() => { tooltip.remove(); }, 600);
      
      await sleep(delayMs);
    }
    
    const finalCursor = document.getElementById('miaobuy-simulated-cursor');
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
        el.classList.remove('miaobuy-locate-highlight');
        void el.offsetWidth; // trigger reflow
        el.classList.add('miaobuy-locate-highlight');
        setTimeout(() => el.classList.remove('miaobuy-locate-highlight'), 1500);
      }
      sendResponse({ success: true });
    } else if (message.action === 'GENERATE_TASK_NAME') {
      (async () => {
        try {
          const aiModel = window.ai?.languageModel || window.ai;
          if (aiModel) {
            let session = typeof aiModel.create === 'function' ? await aiModel.create() : await aiModel.createTextSession();
            const prompt = `为以下网页内容起一个简短的抢购任务名称（如：抢购茅台、预约挂号、秒杀球鞋），限制在12个字以内，仅输出名称，不要输出多余解释。网页标题：${document.title}。网页内容摘要：${document.body.innerText.substring(0, 500)}`;
            let name = await session.prompt(prompt);
            name = name.replace(/["'\\[\\]\n]/g, '').trim();
            sendResponse({ name: name || document.title.substring(0, 15) });
          } else {
            sendResponse({ name: document.title.substring(0, 15) });
          }
        } catch (e) {
          sendResponse({ name: document.title.substring(0, 15) });
        }
      })();
      return true; // indicate async response
    }
  });

})();
