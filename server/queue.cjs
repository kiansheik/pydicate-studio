'use strict';
const { performance } = require('node:perf_hooks');
const { fault } = require('./store.cjs');

class Queue {
  constructor({ observe = () => {}, clock = () => performance.now() } = {}) {
    this.tail = Promise.resolve();
    this.count = 0;
    this.users = new Map();
    this.observe = (observation) => {
      try {
        observe(observation);
      } catch {}
    };
    this.clock = clock;
  }
  run(userId, action, operation = 'other') {
    if (this.count >= 32 || (this.users.get(userId) || 0) >= 8) {
      this.observe({ operation, outcome: 'rejected', queueMs: 0, executionMs: 0 });
      return Promise.reject(fault(429, 'ENGINE_BUSY', 'Aguarde as operações em andamento.'));
    }
    const entered = this.clock();
    this.count++;
    this.users.set(userId, (this.users.get(userId) || 0) + 1);
    const pending = this.tail
      .catch(() => {})
      .then(async () => {
        const started = this.clock();
        let outcome = 'succeeded';
        try {
          return await action();
        } catch (error) {
          outcome = 'failed';
          throw error;
        } finally {
          this.observe({
            operation,
            outcome,
            queueMs: started - entered,
            executionMs: this.clock() - started,
          });
        }
      });
    this.tail = pending;
    return pending.finally(() => {
      this.count--;
      const remaining = this.users.get(userId) - 1;
      if (remaining) this.users.set(userId, remaining);
      else this.users.delete(userId);
    });
  }
}
module.exports = { Queue };
