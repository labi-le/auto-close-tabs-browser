const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TIMEOUT,
  RAM_PER_TAB_MB,
  SUPPORTED_LOCALES,
  normalizeLocale,
  resolveLocale,
  normalizeTheme,
  resolveTheme,
  applyTheme,
  watchSystemTheme,
  isWhiteListedUrl,
  attachTimeToUrl,
  formatRam,
  sanitizeWhitelistInput,
  isValidTimeoutMinutes,
  getTabProtectionReason,
} = require('./logic.js');

test('exports stable business constants', () => {
  assert.equal(DEFAULT_TIMEOUT, 10);
  assert.equal(RAM_PER_TAB_MB, 150);
  assert.deepEqual(SUPPORTED_LOCALES, ['ru', 'en']);
});

test('normalizeLocale and resolveLocale support browser autodetect and manual override', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('ru_RU'), 'ru');
  assert.equal(normalizeLocale('de-DE'), null);

  assert.equal(resolveLocale('en', 'ru-RU'), 'en');
  assert.equal(resolveLocale('auto', 'en-GB'), 'en');
  assert.equal(resolveLocale(null, 'ru-RU'), 'ru');
  assert.equal(resolveLocale(undefined, 'de-DE'), 'ru');
});

test('normalizeTheme and resolveTheme support auto and manual theme selection', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('auto'), 'auto');
  assert.equal(normalizeTheme('sepia'), 'auto');
  assert.equal(normalizeTheme(undefined), 'auto');

  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('applyTheme sets data-theme on documentElement when possible', () => {
  const attrs = {};
  const fakeRoot = {
    documentElement: {
      setAttribute(name, value) {
        attrs[name] = value;
      }
    }
  };

  applyTheme(fakeRoot, 'dark');
  assert.equal(attrs['data-theme'], 'dark');

  assert.doesNotThrow(() => applyTheme(null, 'light'));
});

test('watchSystemTheme subscribes and unsubscribes matchMedia listener', () => {
  const originalWindow = global.window;
  let registeredHandler = null;
  let removedHandler = null;
  const events = [];

  global.window = {
    matchMedia(query) {
      assert.equal(query, '(prefers-color-scheme: dark)');
      return {
        addEventListener(eventName, handler) {
          events.push(eventName);
          registeredHandler = handler;
        },
        removeEventListener(eventName, handler) {
          events.push(`removed:${eventName}`);
          removedHandler = handler;
        }
      };
    }
  };

  try {
    let callbackValue = null;
    const unsubscribe = watchSystemTheme((isDark) => {
      callbackValue = isDark;
    });

    assert.equal(typeof unsubscribe, 'function');
    assert.deepEqual(events, ['change']);
    registeredHandler({ matches: true });
    assert.equal(callbackValue, true);

    unsubscribe();
    assert.deepEqual(events, ['change', 'removed:change']);
    assert.equal(removedHandler, registeredHandler);
  } finally {
    global.window = originalWindow;
  }
});

test('isWhiteListedUrl matches exact host and valid subdomain', () => {
  assert.equal(isWhiteListedUrl('https://example.com/path', ['example.com']), true);
  assert.equal(isWhiteListedUrl('https://docs.example.com/path', ['example.com']), true);
});

test('isWhiteListedUrl blocks spoofed or unsupported urls', () => {
  assert.equal(isWhiteListedUrl('https://notexample.com/path', ['example.com']), false);
  assert.equal(isWhiteListedUrl('chrome://settings', ['settings']), false);
  assert.equal(isWhiteListedUrl('not-a-url', ['example.com']), false);
});

test('attachTimeToUrl appends or replaces timestamp', () => {
  assert.equal(
    attachTimeToUrl('https://www.youtube.com/watch?v=abc', 65.8),
    'https://www.youtube.com/watch?v=abc&t=65s'
  );
  assert.equal(
    attachTimeToUrl('https://www.youtube.com/watch?v=abc&t=12s', 90),
    'https://www.youtube.com/watch?v=abc&t=90s'
  );
});

test('attachTimeToUrl returns original string for invalid inputs', () => {
  assert.equal(attachTimeToUrl('https://example.com', 0), 'https://example.com');
  assert.equal(attachTimeToUrl('invalid-url', 10), 'invalid-url');
});

test('formatRam formats MB and GB thresholds', () => {
  assert.equal(formatRam(0), '0 МБ');
  assert.equal(formatRam(512), '512 МБ');
  assert.equal(formatRam(2048), '2.00 ГБ');
  assert.equal(formatRam(512, 'en'), '512 MB');
  assert.equal(formatRam(2048, 'en'), '2.00 GB');
});

test('sanitizeWhitelistInput normalizes host input', () => {
  assert.equal(sanitizeWhitelistInput(' HTTPS://WWW.GitHub.com/path?q=1 '), 'github.com');
  assert.equal(sanitizeWhitelistInput('sub.domain.com'), 'sub.domain.com');
  assert.equal(sanitizeWhitelistInput(''), '');
});

test('isValidTimeoutMinutes allows only positive integers', () => {
  assert.equal(isValidTimeoutMinutes(1), true);
  assert.equal(isValidTimeoutMinutes(30), true);
  assert.equal(isValidTimeoutMinutes(0), false);
  assert.equal(isValidTimeoutMinutes(-1), false);
  assert.equal(isValidTimeoutMinutes(1.5), false);
  assert.equal(isValidTimeoutMinutes(NaN), false);
});

test('getTabProtectionReason returns first matching protection reason', () => {
  assert.equal(getTabProtectionReason({
    isProtectedTab: false,
    isProtectedDashboard: false,
    isActiveInFocusedWindow: false,
    isPinned: true,
    isAudible: true,
    isWhiteListed: true,
    hasActiveMedia: true,
  }), 'pinned');

  assert.equal(getTabProtectionReason({
    isProtectedTab: false,
    isProtectedDashboard: false,
    isActiveInFocusedWindow: false,
    isPinned: false,
    isAudible: false,
    isWhiteListed: false,
    hasActiveMedia: false,
  }), null);
});
