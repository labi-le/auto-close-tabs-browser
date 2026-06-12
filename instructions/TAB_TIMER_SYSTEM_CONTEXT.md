# Tab Lifecycle Timer — Системная аналитика проекта

> Этот документ описывает архитектурные решения, принятые компромиссы и текущее состояние кода расширения **Tab Lifecycle Timer v2.1**. Предназначен для передачи контекста ИИ-ассистенту, который продолжает работу над проектом.

---

## 1. Что делает расширение

Браузерное расширение для Chromium (MV3) и Firefox, которое **автоматически закрывает вкладки по индивидуальным таймерам**. Таймер запускается в момент открытия вкладки и сбрасывается каждый раз, когда пользователь на неё переключается. Если вкладка провела в фоне дольше установленного лимита — она закрывается.

---

## 2. Структура файлов

```
auto-close-tabs-browser/
├── manifest.json      — конфигурация расширения (MV3)
├── background.js      — Service Worker, вся логика таймеров
├── popup.html         — мини-интерфейс при клике на иконку расширения
├── popup.js           — логика попапа
├── dashboard.html     — полная панель управления (открывается в отдельной вкладке)
├── dashboard.js       — логика панели управления
└── scraper.py         — утилита сборки кода проекта в один файл для передачи ИИ
```

---

## 3. Технологический стек и обоснование

| Решение | Обоснование |
|---|---|
| **Manifest V3** | Обязательный стандарт Chromium. MV2 полностью депрекирован |
| **chrome.alarms** | Единственный надёжный таймер в MV3. Переживает сон/пробуждение Service Worker. Минимальный интервал: 1 минута |
| **Service Worker** | Фоновой скрипт в MV3. Браузер его «усыпляет» при неактивности — это нормально, `chrome.alarms` его будят |
| **chrome.storage.local** | Хранение настроек и состояния. Не используется `chrome.storage.sync` (синхронизация между устройствами не требовалась) |
| **chrome.scripting.executeScript** | Динамическая инжекция скрипта для проверки медиа-элементов на вкладке в момент срабатывания таймера |

### Почему НЕ используются Content Scripts для таймеров

Рассматривался вариант с постоянными content scripts вместо chrome.alarms. Отвергнут по причине:
- Вкладка замораживается браузером при неактивности → JS-таймер в content script останавливается
- Content script не может гарантировать закрытие вкладки, если она давно заморожена
- `chrome.alarms` — правильный инструмент для этой задачи, создан именно для периодических фоновых задач

---

## 4. Архитектура background.js (Service Worker)

### Жизненный цикл вкладки

```
chrome.tabs.onCreated      → resetTimer(tabId)
chrome.tabs.onActivated    → resetTimer(tabId)
chrome.windows.onFocusChanged → resetTimer(activeTab в сфокусированном окне)
chrome.tabs.onRemoved      → chrome.alarms.clear(tabId) + очистка protectedTabIds
chrome.alarms.onAlarm      → диспетчер принятия решений (закрыть или продлить)
```

### Функция resetTimer

```javascript
async function resetTimer(tabId, customTimeout = null) {
  if (!tabId) return;
  try {
    await chrome.alarms.clear(`tab_${tabId}`);           // await обязателен — защита от гонки в SW
    const timeoutMinutes = customTimeout || await getTimeoutMinutes();
    chrome.alarms.create(`tab_${tabId}`, { delayInMinutes: timeoutMinutes });
  } catch (error) { ... }
}
```

**Важно:** `await chrome.alarms.clear(...)` перед `create` — это намеренное решение. Без `await` Service Worker может уснуть между операциями и будильник не создастся. Не убирать.

### Диспетчер решений (onAlarm) — порядок проверок

При срабатывании будильника выполняются проверки по порядку. Первая сработавшая защита — `resetTimer` и `return`.

```
1. timerEnabled === false       → таймер глобально выключен пользователем → продлить
2. protectedTabIds.includes()   → вкладка защищена вручную через popup → продлить
3. tab.url начинается с chrome.runtime.getURL('') → это вкладка самого расширения (dashboard) → продлить (если protectDashboard !== false)
4. tab.active && tab.windowId === lastFocusedWindow.id → вкладка активна В последнем сфокусированном окне → продлить
5. tab.pinned || tab.audible    → закреплена или играет звук прямо сейчас → продлить
6. isWhiteListed(tab.url)       → домен в белом списке → продлить
7. isMediaPlaying(tabId)        → на вкладке есть медиа с currentTime > 0 (играет или на паузе) → продлить
8. Все проверки пройдены        → logClosedTab() + chrome.tabs.remove()
```

### Почему в проверке фокуса используется lastFocusedWindow, а не просто tab.active

**Критически важное архитектурное решение, которое нельзя менять.**

`tab.active = true` означает лишь то, что вкладка активна **внутри своего окна**. При двух открытых окнах браузера (например, на двух мониторах) обе вкладки будут иметь `tab.active = true` одновременно.

Без проверки `lastFocusedWindow.id` вкладки в фоновых окнах никогда не закроются.

`chrome.windows.getLastFocused()` возвращает окно, которое браузер считает активным — даже если весь браузер свёрнут и пользователь работает в другом приложении. Это защищает от сценария «пользователь ушёл в IDE — браузер закрыл все вкладки».

### Защита от Race Condition в Storage

Для записи в `chrome.storage.local` используется очередь промисов (`storageQueue`):

```javascript
let storageQueue = Promise.resolve();

function logClosedTab(title, url) {
  storageQueue = storageQueue.then(async () => {
    // read → modify → write
  }).catch(() => {});
}
```

Это предотвращает потерю данных при параллельных записях (несколько вкладок закрываются одновременно). Не убирать.

### Медиа-проверка: почему такое условие

```javascript
// В коде используется:
return mediaElements.some(media => media.currentTime > 0 && !media.paused && !media.ended);
```

Это защищает только **активно играющее** медиа. Видео на паузе — НЕ защищено этой строкой (это намеренное решение в текущей версии кода).

> **Примечание:** Более ранняя версия использовала `media.currentTime > 0 && !media.ended` (без `!media.paused`) — это защищало и паузу. Текущая версия `v2.1` ужесточила условие. Если нужно вернуть защиту паузы — убрать `&& !media.paused`.

---

## 5. Схема данных в chrome.storage.local

| Ключ | Тип | Описание | Дефолт |
|---|---|---|---|
| `timeoutMinutes` | `number` | Глобальный таймаут закрытия в минутах | `10` |
| `timerEnabled` | `boolean` | Глобальный выключатель таймера | `true` |
| `whiteList` | `string[]` | Массив доменов (без протокола, без www) | `[]` |
| `protectedTabIds` | `number[]` | Tab ID вкладок с ручным иммунитетом | `[]` |
| `protectDashboard` | `boolean` | Защищать ли вкладку панели управления | `true` |
| `trashBin` | `object[]` | Последние 50 закрытых вкладок `{title, url, closedAt}` | `[]` |
| `savedRamMb` | `number` | Счётчик освобождённой памяти (150 МБ за вкладку) | `0` |

---

## 6. UI — Попап (popup.html / popup.js)

Открывается при клике на иконку расширения. Содержит:

- **Мастер-переключатель** — глобальный ON/OFF таймера (`timerEnabled`)
- **Статистика** — текущий таймаут и счётчик памяти
- **Защита текущей вкладки** — тогл «Игнорировать эту вкладку» (`protectedTabIds`)
- **Кнопка** открытия панели управления через `chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })`

> **Важно:** Открытие dashboard через `chrome.runtime.openOptionsPage()` не работает надёжно — попап успевает закрыться раньше. Используется `chrome.tabs.create` напрямую.

---

## 7. UI — Панель управления (dashboard.html / dashboard.js)

Открывается в отдельной вкладке. Содержит 4 блока:

### Глобальные настройки
- Поле ввода таймаута (минуты, 1–1440)
- Тогл «Не закрывать вкладку панели управления»

### Сбереженная память
- Отображает `savedRamMb` в МБ или ГБ

### Белый список доменов
- Добавление/удаление доменов
- Автоочистка ввода от `http://`, `https://`, `www.`, путей
- Рендеринг через безопасный DOM API (защита от XSS)

### Корзина закрытых вкладок
- Живой поиск по названию и URL
- Восстановление одной вкладки (кнопка «Восстановить»)
- Массовое восстановление («Восстановить все») с батчингом по 5 вкладок каждые 200 мс (защита от спавнинг-DoS)
- Рендеринг через безопасный DOM API

### Защищённые вкладки (иммунитет)
- Список вкладок из `protectedTabIds` с живым поиском
- Снятие иммунитета с конкретной вкладки
- Кнопка «Перестать игнорировать все»
- Реактивная синхронизация: если вкладка закрыта — исчезает из списка без перезагрузки страницы

---

## 8. Известные нерешённые проблемы

### 1. Promise.all в batchRestoreTabs (некритично)

```javascript
// Текущий код — если один URL невалиден, батч прерывается
await Promise.all(batch.map(url => {
  if (url) return chrome.tabs.create({ url, active: false });
}));
```

Правильное решение — `Promise.allSettled`. Но в текущей версии вкладки в корзину попадают только через `logClosedTab`, который уже фильтрует не-http URL, поэтому на практике не ломается.

### 2. setAttribute вместо dataset

```javascript
btn.setAttribute(actionBtnConfig.dataAttr.name, actionBtnConfig.dataAttr.val);
// Лучше: btn.dataset[key] = val
```

Работает корректно, просто не идиоматично.

### 3. Массовый resetTimer при смене таймаута — последовательный цикл

```javascript
for (const tab of tabs) {
  if (tab.id) await resetTimer(tab.id, newTimeout);  // последовательно
}
```

При большом числе вкладок Service Worker может быть выгружен до завершения цикла. Безопаснее `Promise.allSettled(tabs.map(...))`, но при умеренном числе вкладок работает нормально.

---

## 9. Что нельзя менять без понимания последствий

| Что | Почему нельзя трогать |
|---|---|
| `await chrome.alarms.clear(...)` в `resetTimer` | Без await — гонка в Service Worker, будильник может не создаться |
| `tab.active && tab.windowId === lastFocusedWindow.id` | Это решение мультиоконности. Замена на просто `tab.active` сломает закрытие вкладок в фоновых окнах |
| `storageQueue` промис-цепочка | Атомарность записи. Без неё — Race Condition при параллельных закрытиях |
| Именование алармов `tab_${tabId}` | По этому паттерну фильтруются чужие алармы в `onAlarm` |
| `chrome.tabs.create` для открытия dashboard | `openOptionsPage()` ненадёжен из попапа |

---

## 10. Разрешения и их обоснование

```json
"permissions": ["tabs", "alarms", "scripting", "storage"],
"host_permissions": ["http://*/*", "https://*/*"]
```

| Разрешение | Зачем |
|---|---|
| `tabs` | Чтение состояния вкладок (active, pinned, audible, url, title), закрытие вкладок |
| `alarms` | Создание и управление таймерами |
| `scripting` | `executeScript` для проверки медиа-элементов на странице |
| `storage` | Хранение настроек и данных |
| `host_permissions` | Без них `executeScript` не работает на произвольных сайтах |

---

## 11. Текущая версия

**v2.1** — production-ready для unpacked использования (через Developer Mode).

Для публикации в Chrome Web Store потребуется:
- Заполнить Single Purpose Justification для `host_permissions`
- Описать зачем нужен `scripting` доступ ко всем сайтам
