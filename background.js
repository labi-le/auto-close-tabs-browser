importScripts('logic.js');

const { DEFAULT_TIMEOUT, RAM_PER_TAB_MB, isWhiteListedUrl, attachTimeToUrl, getTabProtectionReason } = TabLifecycleLogic;

// Очередь для предотвращения Race Condition при последовательной записи в Storage
let storageQueue = Promise.resolve();

// Асинхронное получение таймаута (оптимизировано: поддержка передачи кэшированного значения)
async function getTimeoutMinutes() {
  const data = await chrome.storage.local.get("timeoutMinutes");
  return data.timeoutMinutes || DEFAULT_TIMEOUT;
}

// Продление таймера для конкретной вкладки (с поддержкой передачи готового таймаута)
async function resetTimer(tabId, customTimeout = null) {
  if (!tabId) return;
  try {
    await chrome.alarms.clear(`tab_${tabId}`);
    const timeoutMinutes = customTimeout || await getTimeoutMinutes();
    chrome.alarms.create(`tab_${tabId}`, { delayInMinutes: timeoutMinutes });
  } catch (error) {
    console.error(`[Error] Не удалось обновить таймер для таба ${tabId}:`, error);
  }
}

// Безопасная проверка домена (защита от Subdomain Spoofing)
async function isWhiteListed(urlStr) {
  try {
    const data = await chrome.storage.local.get("whiteList");
    const whiteList = data.whiteList || [];

    return isWhiteListedUrl(urlStr, whiteList);
  } catch (e) {
    return false;
  }
}

// Атомарное логирование за счет выстраивания Promises в цепочку (Очередь)
function logClosedTab(title, url) {
  storageQueue = storageQueue.then(async () => {
    try {
      const data = await chrome.storage.local.get(["trashBin", "savedRamMb"]);
      let trashBin = data.trashBin || [];
      let savedRamMb = data.savedRamMb || 0;

      trashBin.unshift({ title: title || url, url, closedAt: Date.now() });
      if (trashBin.length > 50) trashBin.pop();

      savedRamMb += RAM_PER_TAB_MB;
      await chrome.storage.local.set({ trashBin, savedRamMb });
    } catch (error) {
      console.error("[Error] Ошибка сохранения логов закрытия:", error);
    }
  }).catch(() => {});
}

// Проверка активности медиа (в v2.2 медиа защищает вкладку, даже если на паузе)
async function isMediaPlaying(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const mediaElements = Array.from(document.querySelectorAll('video, audio'));
        // В v2.2 медиа защищает вкладку, если оно запущено и не завершено (даже на паузе)
        return mediaElements.some(media => media.currentTime > 0 && !media.ended);
      }
    });
    return result?.result || false;
  } catch (e) {
    return false; // Защита от системных страниц (chrome://)
  }
}

// Вспомогательная функция сбора времени для поддержанных видеоплееров
async function getMediaCurrentTime(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const media = document.querySelector('video, audio');
        if (!media) return null;
        
        // Если это YouTube, пытаемся дернуть его внутреннее API для точности
        if (window.location.hostname.includes('youtube.com') && typeof ytplayer !== 'undefined') {
          return ytplayer.getCurrentTime ? ytplayer.getCurrentTime() : media.currentTime;
        }
        return media.currentTime;
      }
    });
    return result?.result || null;
  } catch (e) {
    return null;
  }
}

// Санация хранилища при старте браузера (очистка невалидных ID сессии)
chrome.runtime.onStartup.addListener(async () => {
  try {
    const data = await chrome.storage.local.get("protectedTabIds");
    const protectedTabIds = data.protectedTabIds || [];
    if (protectedTabIds.length > 0) {
      // При старте браузера все старые ID вкладок недействительны, полностью очищаем массив
      await chrome.storage.local.set({ protectedTabIds: [] });
      console.log("[Sanitization] Хранилище protectedTabIds успешно очищено при старте сессии.");
    }
  } catch (error) {
    console.error("[Error] Ошибка санации хранилища при старте:", error);
  }
});

// Жизненный цикл
chrome.tabs.onCreated.addListener(async (tab) => { await resetTimer(tab.id); });
chrome.tabs.onActivated.addListener(async ({ tabId }) => { await resetTimer(tabId); });

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: windowId });
    if (activeTab) await resetTimer(activeTab.id);
  } catch (e) {}
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.alarms.clear(`tab_${tabId}`);
  storageQueue = storageQueue.then(async () => {
    const data = await chrome.storage.local.get("protectedTabIds");
    let protectedTabIds = data.protectedTabIds || [];
    if (protectedTabIds.includes(tabId)) {
      protectedTabIds = protectedTabIds.filter(id => id !== tabId);
      await chrome.storage.local.set({ protectedTabIds });
    }
  }).catch(() => {});
});

// Диспетчер принятия решений (с защитой от утечки алармов через изолированный вложенный try)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("tab_")) return;
  const tabId = parseInt(alarm.name.replace("tab_", ""), 10);

  let tabExists = false;

  try {
    const tab = await chrome.tabs.get(tabId);
    tabExists = true; // Вкладка существует в системе

    const settings = await chrome.storage.local.get("timerEnabled");
    if (settings.timerEnabled === false) {
      await resetTimer(tabId);
      return;
    }

    // Вложенный блок для изоляции внутренних ошибок проверок от самого факта существования вкладки
    try {
      const lastFocusedWindow = await chrome.windows.getLastFocused();
      
      const storageData = await chrome.storage.local.get("protectedTabIds");
      const protectedTabIds = storageData.protectedTabIds || [];

      const extensionUrlBase = chrome.runtime.getURL('');
      const storageDataPage = await chrome.storage.local.get("protectDashboard");
      const whitelisted = await isWhiteListed(tab.url);

      const hasActiveMedia = await isMediaPlaying(tabId);

      const protectionReason = getTabProtectionReason({
        isProtectedTab: protectedTabIds.includes(tabId),
        isProtectedDashboard: Boolean(
          tab.url && tab.url.startsWith(extensionUrlBase) && storageDataPage.protectDashboard !== false
        ),
        isActiveInFocusedWindow: Boolean(tab.active && tab.windowId === lastFocusedWindow.id),
        isPinned: Boolean(tab.pinned),
        isAudible: Boolean(tab.audible),
        isWhiteListed: whitelisted,
        hasActiveMedia: hasActiveMedia,
      });

      if (protectionReason) {
        await resetTimer(tabId);
        return;
      }

      // Pragmatic Way: сбор таймкода для поддержанных видеоплатформ
      const supportedDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv'];
      let finalUrl = tab.url;

      if (tab.url) {
        const isSupportedMedia = supportedDomains.some(domain => {
          try {
            return new URL(tab.url).hostname.includes(domain);
          } catch { return false; }
        });

        if (isSupportedMedia) {
          const mediaTime = await getMediaCurrentTime(tabId);
          if (mediaTime && mediaTime > 0) {
            finalUrl = attachTimeToUrl(tab.url, mediaTime);
          }
        }
      }

      // Условия соблюдены — закрываем вкладку с модифицированным (или исходным) URL
      logClosedTab(tab.title, finalUrl);
      await chrome.tabs.remove(tabId);

    } catch (internalError) {
      console.error(`[Internal Error] Ошибка при проверке условий для таба ${tabId}:`, internalError);
      // При любой внутренней ошибке проверок принудительно восстанавливаем аларм, если таб жив
      await resetTimer(tabId);
    }

  } catch (error) {
    // Вкладка не существует (была закрыта пользователем вручную) — безопасно подчищаем аларм
    if (!tabExists) {
      await chrome.alarms.clear(alarm.name);
    }
  }
});

// Реактивный Force Sync (Перевод на конкурентное выполнение для защиты SW от выгрузки)
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && changes.timeoutMinutes) {
    try {
      const newTimeout = changes.timeoutMinutes.newValue || DEFAULT_TIMEOUT;
      const tabs = await chrome.tabs.query({});
      
      // Перевод на конкурентное выполнение для защиты Service Worker от выгрузки
      const promises = tabs.map(tab => {
        if (tab.id) {
          return resetTimer(tab.id, newTimeout);
        }
        return Promise.resolve();
      });
      
      await Promise.allSettled(promises);
    } catch (e) {
      console.error("[Error] Ошибка при массовом обновлении таймеров:", e);
    }
  }
});
