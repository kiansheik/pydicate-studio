'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installApplicationPermissions } = require('../application-permissions.cjs');

function setup(entry = 'studio://app/index.html') {
  const contents = { isDestroyed: () => false, mainFrame: { url: entry } };
  const window = { isDestroyed: () => false, webContents: contents };
  const session = {
    setPermissionRequestHandler(handler) {
      this.request = handler;
    },
    setPermissionCheckHandler(handler) {
      this.check = handler;
    },
  };
  let activeWindow = window;
  installApplicationPermissions(session, {
    getWindow: () => activeWindow,
    // Mirrors the existing main-process URL authority used for navigation/IPC.
    isApplicationURL(raw) {
      try {
        const url = new URL(raw);
        const expected = new URL(entry);
        return (
          url.protocol === expected.protocol &&
          url.host === expected.host &&
          url.pathname === expected.pathname
        );
      } catch {
        return false;
      }
    },
  });
  const url = new URL(entry);
  return {
    contents,
    window,
    session,
    origin: `${url.protocol}//${url.host}`,
    details: { isMainFrame: true, requestingUrl: entry },
    clearWindow: () => {
      activeWindow = null;
    },
  };
}

function request(fixture, contents, permission, details) {
  let result;
  fixture.session.request(contents, permission, (allowed) => (result = allowed), details);
  return result;
}

test('fullscreen works only for the live editor main frame in production and development', () => {
  for (const entry of ['studio://app/index.html', 'http://127.0.0.1:5173/']) {
    const fixture = setup(entry);
    const { contents, session, origin, details } = fixture;
    assert.equal(request(fixture, contents, 'fullscreen', details), true);
    assert.equal(session.check(contents, 'fullscreen', origin, details), true);
    assert.equal(
      request(fixture, contents, 'fullscreen', { ...details, requestingUrl: entry + '#tree' }),
      true,
    );
  }
});

test('external URLs, subframes, missing details, wrong origins and other windows stay denied', () => {
  const fixture = setup();
  const { contents, session, origin, details } = fixture;
  for (const requestingUrl of [
    'https://example.com/index.html',
    'studio://external/index.html',
    'studio://app/other.html',
    'blob:studio://app/fixture',
    'about:blank',
    undefined,
  ]) {
    assert.equal(request(fixture, contents, 'fullscreen', { ...details, requestingUrl }), false);
    assert.equal(
      session.check(contents, 'fullscreen', origin, { ...details, requestingUrl }),
      false,
    );
  }
  for (const invalidDetails of [undefined, {}, { ...details, isMainFrame: false }]) {
    assert.equal(request(fixture, contents, 'fullscreen', invalidDetails), false);
    assert.equal(session.check(contents, 'fullscreen', origin, invalidDetails), false);
  }
  for (const wrongOrigin of ['https://example.com', 'studio://external', 'null', 'invalid'])
    assert.equal(session.check(contents, 'fullscreen', wrongOrigin, details), false);
  for (const wrongContents of [null, { ...contents }]) {
    assert.equal(request(fixture, wrongContents, 'fullscreen', details), false);
    assert.equal(session.check(wrongContents, 'fullscreen', origin, details), false);
  }
});

test('all other capabilities remain denied for the legitimate application', () => {
  const fixture = setup();
  const { contents, session, origin, details } = fixture;
  for (const permission of [
    'media',
    'display-capture',
    'clipboard-read',
    'clipboard-sanitized-write',
    'fileSystem',
    'notifications',
    'geolocation',
    'openExternal',
    'pointerLock',
    'keyboardLock',
    'unknown',
  ]) {
    assert.equal(request(fixture, contents, permission, details), false);
    assert.equal(session.check(contents, permission, origin, details), false);
  }
});

test('teardown and navigation away revoke fullscreen even with old request details', () => {
  for (const revoke of [
    ({ contents }) => (contents.mainFrame.url = 'https://example.com/'),
    ({ contents }) => (contents.isDestroyed = () => true),
    ({ window }) => (window.isDestroyed = () => true),
    ({ clearWindow }) => clearWindow(),
  ]) {
    const fixture = setup();
    revoke(fixture);
    const { contents, session, origin, details } = fixture;
    assert.equal(request(fixture, contents, 'fullscreen', details), false);
    assert.equal(session.check(contents, 'fullscreen', origin, details), false);
  }
});
