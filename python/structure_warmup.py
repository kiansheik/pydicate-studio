"""Bounded background index jobs; publishing an index never changes research data."""
from collections import OrderedDict
from copy import copy, deepcopy
from threading import Lock, Thread
from time import monotonic


class StructureWarmup:
    def __init__(self):
        self.lock = Lock()
        self.pending = OrderedDict()
        self.completed = OrderedDict()
        self.running = None
        self.thread = None
        self.base = None
        self.failures = {}

    def request(self, service, params, key):
        with self.lock:
            if key in self.completed:
                result = self.completed[key]
                if not isinstance(result, Exception):
                    return result
                if monotonic() - self.failures.get(key, 0) < 5:
                    raise result
                del self.completed[key]
                self.failures.pop(key, None)
            if key != self.running and key not in self.pending:
                adapter = copy(service.adapter)
                adapter.project = deepcopy(adapter.project)
                adapter.structure_cache = deepcopy(self.base or getattr(adapter, 'structure_cache', None))
                self.pending[key] = (adapter, deepcopy(params))
                while len(self.pending) > 8:
                    self.pending.popitem(last=False)
            if self.thread is None:
                self.thread = Thread(target=self.run, daemon=True, name='structure-index')
                self.thread.start()
        return None

    def run(self):
        from authoring_service import AuthoringService
        while True:
            with self.lock:
                if not self.pending:
                    self.thread = None
                    self.running = None
                    return
                key, (adapter, params) = self.pending.popitem(last=False)
                self.running = key
                if self.base and self.base['baseKey'] == key[0]:
                    adapter.structure_cache = deepcopy(self.base)
            try:
                result = AuthoringService(adapter).structure_index({**params, 'background': False})
            except Exception as error:
                result = error
            with self.lock:
                if not isinstance(result, Exception):
                    self.base = {'baseKey': result['baseKey'], 'base': result['base']}
                if isinstance(result, Exception): self.failures[key] = monotonic()
                self.completed[key] = result
                while len(self.completed) > 8:
                    old, _ = self.completed.popitem(last=False)
                    self.failures.pop(old, None)
                self.running = None
