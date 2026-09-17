'use strict';

/** Fullscreen belongs to the local editor. No other permission is granted. */
function installApplicationPermissions(session, { getWindow, isApplicationURL }) {
  function allowed(contents, permission, details, requestingOrigin) {
    const window = getWindow();
    if (
      permission !== 'fullscreen' ||
      !window ||
      window.isDestroyed() ||
      !contents ||
      contents !== window.webContents ||
      contents.isDestroyed() ||
      details?.isMainFrame !== true ||
      !isApplicationURL(details.requestingUrl) ||
      !isApplicationURL(contents.mainFrame.url)
    )
      return false;
    if (requestingOrigin !== undefined) {
      try {
        const origin = new URL(requestingOrigin);
        const frame = new URL(contents.mainFrame.url);
        // URL.origin is "null" for the custom studio scheme in Node. Compare
        // its actual scheme and authority instead of treating opaque origins
        // as interchangeable.
        if (origin.protocol !== frame.protocol || origin.host !== frame.host) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(contents, permission, details));
  });
  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    allowed(contents, permission, details, requestingOrigin),
  );
}

module.exports = { installApplicationPermissions };
