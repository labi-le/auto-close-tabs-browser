document.addEventListener('DOMContentLoaded', async () => {
  // DOM Элементы
  const timeoutInput = document.getElementById('timeoutInput');
  const saveTimeoutBtn = document.getElementById('saveTimeoutBtn');
  const ramDisplay = document.getElementById('ramDisplay');
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelistBtn');
  const whitelistContainer = document.getElementById('whitelistContainer');
  const trashContainer = document.getElementById('trashContainer');
  const trashSearchInput = document.getElementById('trashSearchInput');
  const protectDashboardCheckbox = document.getElementById('protectDashboardCheckbox');
  
  // Элементы управления иммунитетом
  const protectedSearchInput = document.getElementById('protectedSearchInput');
  const unprotectAllBtn = document.getElementById('unprotectAllBtn');
  const protectedTabsContainer = document.getElementById('protectedTabsContainer');
  const restoreAllBtn = document.getElementById('restoreAllBtn');

  // Кэш состояния
  let globalTrashBin = [];
  let globalProtectedTabs = [];

  // Защита от XSS: Безопасное создание DOM-узлов вместо innerHTML
  function createDOMRow(mainText, subText, actionBtnConfig) {
    const li = document.createElement('li');
    
    const span = document.createElement('span');
    span.className = 'tab-title';
    
    if (subText) {
      const boldPrefix = document.createElement('b');
      boldPrefix.textContent = subText + ' ';
      span.appendChild(boldPrefix);
    }
    
    const textNode = document.createTextNode(mainText);
    span.appendChild(textNode);
    span.title = mainText;
    
    li.appendChild(span);

    if (actionBtnConfig) {
      const btn = document.createElement('button');
      btn.className = actionBtnConfig.className;
      btn.textContent = actionBtnConfig.text;
      btn.setAttribute(actionBtnConfig.dataAttr.name, actionBtnConfig.dataAttr.val);
      li.appendChild(btn);
    }
    
    return li;
  }

  // Отказоустойчивое батчевое восстановление (Promise.allSettled для изоляции битых URL)
  async function batchRestoreTabs(urls, batchSize = 5, delayMs = 200) {
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      // Замена Promise.all на Promise.allSettled для изоляции ошибок битых URL
      await Promise.allSettled(batch.map(url => {
        if (url) return chrome.tabs.create({ url, active: false });
        return Promise.resolve();
      }));

      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Реактивный слушатель удаления вкладок для синхронизации кэша UI в реальном времени
  chrome.tabs.onRemoved.addListener((tabId) => {
    const initialLength = globalProtectedTabs.length;
    globalProtectedTabs = globalProtectedTabs.filter(tab => tab.id !== tabId);
    if (globalProtectedTabs.length !== initialLength) {
      applyProtectedFilter();
    }
  });

  async function init() {
    const data = await chrome.storage.local.get(['timeoutMinutes', 'savedRamMb', 'whiteList', 'trashBin', 'protectDashboard', 'protectedTabIds']);
    
    timeoutInput.value = data.timeoutMinutes || 10;
    renderRam(data.savedRamMb || 0);
    renderWhitelist(data.whiteList || []);
    protectDashboardCheckbox.checked = data.protectDashboard !== false;
    
    globalTrashBin = data.trashBin || [];
    applyTrashFilter();

    const activeTabs = await chrome.tabs.query({});
    const protectedIds = data.protectedTabIds || [];
    globalProtectedTabs = activeTabs.filter(tab => protectedIds.includes(tab.id));
    applyProtectedFilter();
  }

  protectDashboardCheckbox.addEventListener('change', async () => {
    await chrome.storage.local.set({ protectDashboard: protectDashboardCheckbox.checked });
  });

  function renderRam(mb) {
    if (mb >= 1024) ramDisplay.textContent = `${(mb / 1024).toFixed(2)} ГБ`;
    else ramDisplay.textContent = `${mb} МБ`;
  }

  // Защита от XSS: Безопасный рендер белого списка
  function renderWhitelist(list) {
    whitelistContainer.innerHTML = '';
    list.forEach((domain, index) => {
      const row = createDOMRow(domain, null, {
        className: 'delete-btn',
        text: '×',
        dataAttr: { name: 'data-index', val: String(index) }
      });
      whitelistContainer.appendChild(row);
    });
  }

  function applyTrashFilter() {
    const query = trashSearchInput.value.toLowerCase().trim();
    const filtered = globalTrashBin.filter(item => 
      (item.title && item.title.toLowerCase().includes(query)) || (item.url && item.url.toLowerCase().includes(query))
    );
    renderTrash(filtered);
  }

  // Защита от XSS: Безопасный рендер корзины
  function renderTrash(list) {
    trashContainer.innerHTML = '';
    if (list.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.style.cssText = 'color: #80868b; justify-content: center;';
      emptyLi.textContent = 'Корзина пуста';
      trashContainer.appendChild(emptyLi);
      return;
    }
    list.forEach((tab) => {
      const row = createDOMRow(tab.title || tab.url, null, {
        className: 'secondary restore-btn',
        text: 'Восстановить',
        dataAttr: { name: 'data-url', val: tab.url }
      });
      trashContainer.appendChild(row);
    });
  }

  function applyProtectedFilter() {
    const query = protectedSearchInput.value.toLowerCase().trim();
    const filtered = globalProtectedTabs.filter(tab => 
      (tab.title && tab.title.toLowerCase().includes(query)) || (tab.url && tab.url.toLowerCase().includes(query))
    );
    renderProtectedTabs(filtered);
  }

  // Защита от XSS: Безопасный рендер защищенных вкладок
  function renderProtectedTabs(list) {
    protectedTabsContainer.innerHTML = '';
    if (list.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.style.cssText = 'color: #80868b; justify-content: center;';
      emptyLi.textContent = 'Защищенных вкладок не найдено';
      protectedTabsContainer.appendChild(emptyLi);
      return;
    }
    list.forEach((tab) => {
      const row = createDOMRow(tab.title || tab.url, `[ID: ${tab.id}]`, {
        className: 'secondary remove-protect-btn',
        text: 'Снять иммунитет',
        dataAttr: { name: 'data-id', val: String(tab.id) }
      });
      protectedTabsContainer.appendChild(row);
    });
  }

  // Проверка и запрос разрешений для Firefox (Gecko)
  async function checkAndRequestPermissions() {
    const isFirefox = typeof chrome !== 'undefined' && typeof browser !== 'undefined';
    
    if (isFirefox) {
      try {
        const hasPermissions = await chrome.permissions.contains({
          origins: ["http://*/*", "https://*/*"]
        });
        
        const banner = document.getElementById('permissionsBanner');
        const requestBtn = document.getElementById('requestPermissionsBtn');
        
        if (!hasPermissions && banner && requestBtn) {
          banner.classList.add('visible');
          
          requestBtn.addEventListener('click', async () => {
            const granted = await chrome.permissions.request({
              origins: ["http://*/*", "https://*/*"]
            });
            
            if (granted) {
              banner.classList.remove('visible');
              console.log("[Permissions] Доступ к сайтам успешно получен в Firefox.");
              if (typeof init === 'function') init();
            }
          });
        }
      } catch (e) {
        console.warn("[Permissions] Firefox API недоступен:", e);
      }
    }
  }

  // Слушатели живого поиска
  trashSearchInput.addEventListener('input', applyTrashFilter);
  protectedSearchInput.addEventListener('input', applyProtectedFilter);

  // Массовое восстановление с батчингом
  restoreAllBtn.addEventListener('click', async () => {
    if (globalTrashBin.length === 0) return;

    if (confirm(`Восстановить все вкладки из корзины (${globalTrashBin.length} шт.)?`)) {
      try {
        const urlsToRestore = globalTrashBin.map(t => t.url).filter(Boolean);
        globalTrashBin = [];
        await chrome.storage.local.set({ trashBin: globalTrashBin });
        applyTrashFilter();

        // Запуск безопасного каскадного восстановления
        await batchRestoreTabs(urlsToRestore);
      } catch (error) {
        console.error('[Error] Ошибка массового восстановления:', error);
      }
    }
  });

  unprotectAllBtn.addEventListener('click', async () => {
    if (globalProtectedTabs.length === 0) return;
    if (confirm('Вы уверены, что хотите снять защиту со ВСЕХ вкладок?')) {
      await chrome.storage.local.set({ protectedTabIds: [] });
      globalProtectedTabs = [];
      applyProtectedFilter();
    }
  });

  protectedTabsContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-protect-btn')) {
      const tabId = parseInt(e.target.getAttribute('data-id'), 10);
      
      const data = await chrome.storage.local.get('protectedTabIds');
      let protectedTabIds = data.protectedTabIds || [];
      protectedTabIds = protectedTabIds.filter(id => id !== tabId);
      
      await chrome.storage.local.set({ protectedTabIds });
      
      globalProtectedTabs = globalProtectedTabs.filter(tab => tab.id !== tabId);
      applyProtectedFilter();
    }
  });

  saveTimeoutBtn.addEventListener('click', async () => {
    const min = parseInt(timeoutInput.value, 10);
    if (min >= 1) {
      await chrome.storage.local.set({ timeoutMinutes: min });
      alert('Интервал успешно обновлен для всех вкладок!');
    }
  });

  addWhitelistBtn.addEventListener('click', async () => {
    let domain = whitelistInput.value.trim().toLowerCase();
    if (!domain) return;
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const data = await chrome.storage.local.get('whiteList');
    let whiteList = data.whiteList || [];
    if (!whiteList.includes(domain)) {
      whiteList.push(domain);
      await chrome.storage.local.set({ whiteList });
      renderWhitelist(whiteList);
      whitelistInput.value = '';
    }
  });

  whitelistContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      const data = await chrome.storage.local.get('whiteList');
      let whiteList = data.whiteList || [];
      whiteList.splice(index, 1);
      await chrome.storage.local.set({ whiteList });
      renderWhitelist(whiteList);
    }
  });

  trashContainer.addEventListener('click', async (e) => {
    if (e.target.classList.contains('restore-btn')) {
      const url = e.target.getAttribute('data-url');
      if (url) {
        await chrome.tabs.create({ url, active: false });
        globalTrashBin = globalTrashBin.filter(item => item.url !== url);
        await chrome.storage.local.set({ trashBin: globalTrashBin });
        applyTrashFilter();
      }
    }
  });

  init();
  checkAndRequestPermissions();
});
