"""Persistent JSON-lines lab worker. stdout is protocol only; one line per reply.

It is started lazily, on the first laboratory request — never when Studio opens
or when the tab becomes visible. Long preparation, training and evaluation runs
are separate batch processes, so this worker stays responsive and the ordinary
Studio worker is never blocked by lab work.
"""
from __future__ import annotations

import json
import sys
import time
from contextlib import redirect_stdout
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser_lab import jobs
from parser_lab.artifacts import ArtifactStore
from parser_lab.contracts import result as make_result
from parser_lab.engine import LabEngine
from parser_lab.index import LabIndex
from parser_lab.judgments import JudgmentLog
from parser_lab.normalization import InputError, prepare
from parser_lab.projection import project
from parser_lab.ranker import Ranker
from parser_lab.search import Budget, analyze

MAX_LINE = 1_000_000


class WorkerError(RuntimeError):
    def __init__(self, message, code='LAB_ERROR'):
        super().__init__(message)
        self.code = code


class LabWorker:
    def __init__(self, parent, artifacts, source_id):
        self.parent = parent
        self.artifacts = artifacts
        self.source_id = source_id
        self._engine = None
        self.store = ArtifactStore(artifacts)
        self.judgments = JudgmentLog(Path(artifacts) / 'judgments.jsonl')
        self._index = None
        self._index_id = None
        self._ranker = None
        self._ranker_id = None

    @property
    def engine(self):
        if self._engine is None:
            self._engine = LabEngine(self.parent, source_id=self.source_id)
        return self._engine

    def index_for(self, artifact_id=None):
        fingerprint = self.engine.context_fingerprint()
        artifact_id = artifact_id or self.store.active_for('index', fingerprint)
        if not artifact_id:
            raise WorkerError('Nenhum índice compatível está ativo. Prepare a linha de base.',
                              'LAB_NO_INDEX')
        if self._index_id != artifact_id:
            self._index = LabIndex(self.store.directory(artifact_id), self.store.manifest(artifact_id))
            self._index_id = artifact_id
        return self._index_id, self._index

    def ranker_for(self, artifact_id=None):
        fingerprint = self.engine.context_fingerprint()
        artifact_id = artifact_id if artifact_id is not None else self.store.active_for('ranker', fingerprint)
        if not artifact_id:
            return None, None
        if self._ranker_id != artifact_id:
            self._ranker = Ranker.load(self.store.directory(artifact_id) / 'ranker.json')
            self._ranker_id = artifact_id
        return self._ranker_id, self._ranker

    # -- methods -----------------------------------------------------------
    def context(self, params):
        fingerprint = self.engine.context_fingerprint()
        return {'context': self.engine.context(), 'artifacts': self.store.status(fingerprint),
                'judgments': self.judgments.count()}

    def status(self, params):
        fingerprint = None
        try:
            fingerprint = self.engine.context_fingerprint()
        except Exception:
            pass
        return self.store.status(fingerprint)

    def analyze(self, params):
        started = time.perf_counter()
        try:
            prepared = prepare(params.get('text'))
        except InputError as error:
            raise WorkerError(str(error), error.code)
        index_id, index = self.index_for(params.get('indexId'))
        use_ranker = params.get('useRanker', True)
        ranker_id, ranker = self.ranker_for(params.get('rankerId')) if use_ranker else (None, None)
        seconds = min(float(params.get('seconds', 6.0)), 30.0)
        candidates, rejections, timings, diagnostics = analyze(
            self.engine, index, prepared['normalized'],
            budget=Budget({'maxSeconds': seconds}), ranker=ranker)
        timings['request'] = round(time.perf_counter() - started, 4)
        status = 'complete' if candidates else 'unknown'
        message = ''
        if not candidates:
            message = ('Nenhuma análise completa foi validada. A busca só combina as famílias e '
                       'o léxico declarados neste índice; ortografia histórica não é convertida.')
        return make_result(
            input_profile=prepared, context=self.engine.context(),
            artifacts={'index': index_id, 'ranker': ranker_id, 'indexCounts': index.counts(),
                       'indexRecipe': (self.store.manifest(index_id) or {}).get('recipe', {})},
            candidates=candidates, rejections=rejections, timings=timings, status=status,
            message=message, configuration={'diagnostics': diagnostics, 'ranker': bool(ranker),
                                            'seconds': seconds})

    def parse(self, params):
        """Parse a lab expression into the editable source tree."""
        raw = params.get('raw')
        if not isinstance(raw, str) or len(raw) > 100_000:
            raise WorkerError('Expressão ausente ou muito grande.', 'LAB_INPUT')
        return self.engine.tree(raw)

    def evaluate(self, params):
        """Realize a lab expression in the answer-free context."""
        raw = params.get('raw')
        if not isinstance(raw, str) or len(raw) > 100_000:
            raise WorkerError('Expressão ausente ou muito grande.', 'LAB_INPUT')
        try:
            realized = self.engine.realize(raw)
        except Exception as error:
            raise WorkerError(f'{type(error).__name__}: {error}', 'LAB_ENGINE')
        realized['morphemeUnits'] = (self.engine.morphemes(realized['annotated'])
                                     if realized.get('annotated') else [])
        realized['expression'] = raw
        realized['context'] = self.engine.context()
        return realized

    def activate(self, params):
        kind, artifact_id = params.get('kind'), params.get('artifactId')
        if not isinstance(kind, str) or not isinstance(artifact_id, str):
            raise WorkerError('Informe o tipo e o identificador do artefato.', 'LAB_INPUT')
        self._index_id = self._ranker_id = None
        return self.store.activate(kind, artifact_id)

    def deactivate(self, params):
        self._index_id = self._ranker_id = None
        return self.store.deactivate(params.get('kind'))

    def clear_staging(self, params):
        """Discard interrupted preparation leftovers; a rerun starts over."""
        return {'removed': self.store.clear_staging()}

    def collisions(self, params):
        _index_id, index = self.index_for(params.get('indexId'))
        rows = index.collisions()
        return {'total': len(rows), 'collisions': rows[:int(params.get('limit', 25))],
                'note': 'Chaves normalizadas coincidentes preservam identidades lexicais distintas.'}

    def judgment_add(self, params):
        return self.judgments.append(params)

    def judgment_list(self, params):
        return {'judgments': self.judgments.read(int(params.get('limit', 100)))}

    def optional_status(self, params):
        from parser_lab.agent import agent_status
        from parser_lab.neural import neural_status
        return {'neural': neural_status(), 'agent': agent_status()}

    def project(self, params):
        return project(params.get('raw', ''))


METHODS = ('context', 'status', 'analyze', 'parse', 'evaluate', 'activate', 'deactivate',
           'collisions', 'judgment_add', 'judgment_list', 'optional_status', 'project',
           'clear_staging')


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parent', required=True)
    parser.add_argument('--artifacts', required=True)
    parser.add_argument('--source', default='araujo_catecismo_1686')
    arguments = parser.parse_args()
    worker = LabWorker(arguments.parent, arguments.artifacts, arguments.source)
    for line in sys.stdin:
        request_id = None
        try:
            if len(line) > MAX_LINE:
                raise WorkerError('Mensagem muito grande.', 'LAB_INPUT')
            request = json.loads(line)
            request_id = request.get('id')
            method = request.get('method')
            params = request.get('params') or {}
            if method not in METHODS or not isinstance(params, dict):
                raise WorkerError('Operação de laboratório indisponível.', 'LAB_UNKNOWN_METHOD')
            with redirect_stdout(sys.stderr):
                result = getattr(worker, method)(params)
            response = {'id': request_id, 'result': result}
        except WorkerError as error:
            response = {'id': request_id, 'error': {'message': str(error), 'code': error.code}}
        except Exception as error:
            response = {'id': request_id,
                        'error': {'message': f'{type(error).__name__}: {error}', 'code': 'LAB_ERROR'}}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
