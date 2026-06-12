(function (globalScope) {
  const DEFAULT_TIMEOUT = 10;
  const RAM_PER_TAB_MB = 150;
  const SUPPORTED_LOCALES = ['ru', 'en'];

  function isWhiteListedUrl(urlStr, whiteList = []) {
    try {
      if (!urlStr || !urlStr.startsWith('http')) return false;
      const url = new URL(urlStr);

      return whiteList.some(domain => {
        return url.hostname === domain || url.hostname.endsWith('.' + domain);
      });
    } catch (e) {
      return false;
    }
  }

  function attachTimeToUrl(urlStr, seconds) {
    if (!seconds || seconds <= 0) return urlStr;

    try {
      const url = new URL(urlStr);
      url.searchParams.set('t', `${Math.floor(seconds)}s`);
      return url.toString();
    } catch (e) {
      return urlStr;
    }
  }

  function normalizeLocale(locale) {
    if (typeof locale !== 'string') return null;

    const normalized = locale.trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LOCALES.includes(normalized) ? normalized : null;
  }

  function resolveLocale(localePreference, browserLanguage) {
    const preferredLocale = normalizeLocale(localePreference);
    if (preferredLocale) return preferredLocale;

    return normalizeLocale(browserLanguage) || 'ru';
  }

  function formatRam(mb, locale = 'ru') {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ${locale === 'en' ? 'GB' : 'ГБ'}`;
    return `${mb} ${locale === 'en' ? 'MB' : 'МБ'}`;
  }

  function sanitizeWhitelistInput(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .split('/')[0];
  }

  function isValidTimeoutMinutes(value) {
    return Number.isInteger(value) && value >= 1;
  }

  function normalizeTheme(theme) {
    const valid = ['auto', 'light', 'dark'];
    if (valid.includes(theme)) return theme;
    return 'auto';
  }

  function resolveTheme(themePreference, isSystemDark) {
    const preference = normalizeTheme(themePreference);
    if (preference === 'auto') {
      return isSystemDark ? 'dark' : 'light';
    }
    return preference;
  }

  function applyTheme(root, resolvedTheme) {
    if (root && root.documentElement) {
      root.documentElement.setAttribute('data-theme', resolvedTheme);
    }
  }

  function watchSystemTheme(callback) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => callback(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }

  function getTabProtectionReason(context) {
    if (context.isProtectedTab) return 'protected-tab';
    if (context.isProtectedDashboard) return 'protected-dashboard';
    if (context.isActiveInFocusedWindow) return 'active-tab';
    if (context.isPinned) return 'pinned';
    if (context.isAudible) return 'audible';
    if (context.isWhiteListed) return 'whitelisted';
    if (context.hasActiveMedia) return 'active-media';
    return null;
  }

  const api = {
    DEFAULT_TIMEOUT,
    RAM_PER_TAB_MB,
    SUPPORTED_LOCALES,
    normalizeLocale,
    resolveLocale,
    isWhiteListedUrl,
    attachTimeToUrl,
    formatRam,
    sanitizeWhitelistInput,
    isValidTimeoutMinutes,
    normalizeTheme,
    resolveTheme,
    applyTheme,
    watchSystemTheme,
    getTabProtectionReason,
  };

  globalScope.TabLifecycleLogic = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
