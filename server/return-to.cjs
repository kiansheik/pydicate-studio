'use strict';

// Studio navigation lives in root query parameters. Never turn authentication
// into a general redirect endpoint, including to another same-origin handler.
function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^\/(?:\?|$)/.test(value) || value.includes('#')) return '/';
  try {
    if (/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return '/';
    const url = new URL(value, 'https://studio.invalid');
    if (url.origin !== 'https://studio.invalid' || url.pathname !== '/' || url.hash) return '/';
    const target = url.pathname + url.search;
    return target.length <= 2048 ? target : '/';
  } catch { return '/'; }
}

module.exports = { safeReturnTo };
