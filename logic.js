(function (globalScope) {
  const DEFAULT_TIMEOUT = 10;
  const RAM_PER_TAB_MB = 150;

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

  function formatRam(mb) {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ГБ`;
    return `${mb} МБ`;
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
    isWhiteListedUrl,
    attachTimeToUrl,
    formatRam,
    sanitizeWhitelistInput,
    isValidTimeoutMinutes,
    getTabProtectionReason,
  };

  globalScope.TabLifecycleLogic = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
