(function (globalScope) {
  const translations = {
    ru: {
      popupTitle: 'Tab Lifecycle Timer',
      timerRunning: 'Таймер работает',
      timerPaused: 'Таймер НА ПАУЗЕ',
      currentTimeoutLabel: 'Текущий таймаут:',
      timeoutUnit: 'мин.',
      savedMemoryLabel: 'Сберегли памяти:',
      ignoreCurrentTab: 'Игнорировать эту вкладку',
      openDashboard: 'Панель управления',

      dashboardTitle: 'Панель управления расширением',
      globalSettings: 'Глобальные настройки',
      globalSettingsHint: 'Вкладки закрываются, если провели в фоне указанное количество минут.',
      save: 'Сохранить',
      protectDashboard: 'Не закрывать вкладку Панели Управления',
      languageLabel: 'Язык интерфейса',
      languageAuto: 'Авто (по браузеру)',
      languageRu: 'Русский',
      languageEn: 'English',
      themeLabel: 'Тема оформления',
      themeAuto: 'Авто (по системе)',
      themeLight: 'Светлая',
      themeDark: 'Тёмная',
      savedMemoryTitle: 'Сбереженная память',
      savedMemoryHint: 'Примерный объем оперативной памяти, освобожденный утилитой:',
      whitelistTitle: 'Белый список доменов (Всегда игнорировать сайт)',
      whitelistPlaceholder: 'например: github.com',
      add: 'Добавить',
      trashTitle: 'Недавно закрытые вкладки (Корзина)',
      trashSearchPlaceholder: 'Поиск по названию или URL...',
      restoreAll: 'Восстановить все',
      protectedTabsTitle: 'Вкладки с активным иммунитетом (Защищены через меню)',
      protectedSearchPlaceholder: 'Поиск по защищенным вкладкам...',
      unprotectAll: 'Перестать игнорировать все',
      permissionsBanner: '⚠️ Для работы анализа медиа в Firefox необходимо предоставить доступ к сайтам.',
      requestPermissions: 'Разрешить доступ',

      trashEmpty: 'Корзина пуста',
      protectedEmpty: 'Защищенных вкладок не найдено',
      restore: 'Восстановить',
      removeProtection: 'Снять иммунитет',
      timeoutSaved: 'Интервал успешно обновлен для всех вкладок!',
      restoreAllConfirm: 'Восстановить все вкладки из корзины ({count} шт.)?',
      unprotectAllConfirm: 'Вы уверены, что хотите снять защиту со ВСЕХ вкладок?',
    },
    en: {
      popupTitle: 'Tab Lifecycle Timer',
      timerRunning: 'Timer is active',
      timerPaused: 'Timer is PAUSED',
      currentTimeoutLabel: 'Current timeout:',
      timeoutUnit: 'min.',
      savedMemoryLabel: 'Memory saved:',
      ignoreCurrentTab: 'Ignore this tab',
      openDashboard: 'Dashboard',

      dashboardTitle: 'Extension dashboard',
      globalSettings: 'Global settings',
      globalSettingsHint: 'Tabs are closed if they stay inactive in the background for the selected number of minutes.',
      save: 'Save',
      protectDashboard: 'Do not close the dashboard tab',
      languageLabel: 'Interface language',
      languageAuto: 'Auto (browser language)',
      languageRu: 'Русский',
      languageEn: 'English',
      themeLabel: 'Theme',
      themeAuto: 'Auto (system)',
      themeLight: 'Light',
      themeDark: 'Dark',
      savedMemoryTitle: 'Saved memory',
      savedMemoryHint: 'Estimated amount of RAM freed by the extension:',
      whitelistTitle: 'Domain whitelist (Always ignore this site)',
      whitelistPlaceholder: 'for example: github.com',
      add: 'Add',
      trashTitle: 'Recently closed tabs (Trash)',
      trashSearchPlaceholder: 'Search by title or URL...',
      restoreAll: 'Restore all',
      protectedTabsTitle: 'Tabs with active immunity (Protected via menu)',
      protectedSearchPlaceholder: 'Search protected tabs...',
      unprotectAll: 'Stop ignoring all',
      permissionsBanner: '⚠️ Firefox needs website access permission for media analysis to work.',
      requestPermissions: 'Grant access',

      trashEmpty: 'Trash is empty',
      protectedEmpty: 'No protected tabs found',
      restore: 'Restore',
      removeProtection: 'Remove immunity',
      timeoutSaved: 'The timeout has been updated for all tabs!',
      restoreAllConfirm: 'Restore all tabs from trash ({count})?',
      unprotectAllConfirm: 'Are you sure you want to remove protection from ALL tabs?',
    },
  };

  function format(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
  }

  function t(locale, key, params) {
    const current = translations[locale] || translations.ru;
    const fallback = translations.ru[key] || key;
    return format(current[key] || fallback, params);
  }

  function applyI18n(root, locale) {
    root.querySelectorAll('[data-i18n]').forEach(node => {
      node.textContent = t(locale, node.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      node.placeholder = t(locale, node.dataset.i18nPlaceholder);
    });

    root.querySelectorAll('[data-i18n-title]').forEach(node => {
      node.title = t(locale, node.dataset.i18nTitle);
    });
  }

  globalScope.TabLifecycleI18n = {
    t,
    applyI18n,
    translations,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
