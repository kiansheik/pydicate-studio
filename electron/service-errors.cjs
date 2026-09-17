'use strict';

/** Electron does not preserve custom Error fields across ipcRenderer.invoke.
 * Keep service codes in a small error-only reply; successful values stay intact.
 */
function serviceErrorReply(error) {
  if (!error || typeof error.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code))
    return null;
  return {
    _studioServiceError: {
      version: 1,
      code: error.code,
      message:
        typeof error.message === 'string'
          ? error.message.slice(0, 16_384)
          : 'O serviço não conseguiu completar a operação.',
    },
  };
}

module.exports = { serviceErrorReply };
