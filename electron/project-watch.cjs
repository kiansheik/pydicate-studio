'use strict';
const fs = require('node:fs');

function createProjectWatch({
  directory,
  onChange,
  isSuppressed = () => false,
  watch = fs.watch,
  delay = 250,
}) {
  let timer;
  let closed = false;
  let suppressedChange = false;
  const watcher = watch(directory, () => {
    if (closed) return;
    clearTimeout(timer);
    if (isSuppressed()) {
      suppressedChange = true;
      return;
    }
    timer = setTimeout(() => {
      if (!closed && !isSuppressed()) onChange();
    }, delay);
  });
  return {
    get suppressedChange() {
      return suppressedChange;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      watcher.close();
    },
  };
}
module.exports = { createProjectWatch };
