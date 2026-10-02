"""Exercise the real JSONL loop with legal short writes on unbuffered stdout."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import worker


class ShortOutput(io.RawIOBase):
    def __init__(self, limit=8191, interrupt=False):
        self.data = bytearray()
        self.limit = limit
        self.interrupt = interrupt
        self.calls = 0

    def writable(self):
        return True

    def write(self, data):
        self.calls += 1
        if self.interrupt and self.calls == 2:
            raise InterruptedError('simulated signal during stdout write')
        count = min(len(data), self.limit)
        self.data.extend(data[:count])
        return count


class WorkerProtocolTests(unittest.TestCase):
    def run_main(self, requests, output, result):
        class Adapter:
            def __init__(self, state):
                pass

            def open_project(self, parent):
                return result

            def invoke(self, method, params):
                if method == 'structure_prepare':
                    return {'preparing': True}
                return {'surface': "te'õmbûera"}

        stream = io.TextIOWrapper(output, encoding='utf-8', write_through=True)
        with patch.object(worker, 'ProjectAdapter', Adapter), \
                patch.object(sys, 'argv', ['worker.py']), \
                patch.object(sys, 'stdin', io.StringIO(requests)), \
                patch.object(sys, 'stdout', stream):
            worker.main()
        data = bytes(output.data)
        stream.detach()
        return data

    def test_main_preserves_large_project_and_following_response_on_short_writes(self):
        project = {'id': 'local-protocol-fixture', 'passages': [
            {'id': f'passage:{index}', 'surface': "te'õmbûera", 'notes': 'ẽ' * 1000}
            for index in range(154)
        ]}
        requests = '\n'.join(json.dumps(value) for value in [
            {'id': 1, 'method': 'open_project', 'params': {'parentPath': '/fixture'}},
            {'id': 2, 'method': 'evaluate_expression', 'params': {}},
        ]) + '\n'
        output = ShortOutput()
        data = self.run_main(requests, output, project)
        responses = [json.loads(line) for line in data.splitlines()]
        self.assertEqual(responses, [
            {'id': 1, 'result': project}, {'id': 2, 'result': {'surface': "te'õmbûera"}},
        ])
        self.assertGreater(output.calls, 30)

    def test_main_retries_interrupted_short_writes_without_dropping_utf8_bytes(self):
        output = ShortOutput(limit=7, interrupt=True)
        project = {'id': 'local-fixture', 'surface': "te'õmbûera"}
        data = self.run_main(json.dumps({'id': 1, 'method': 'open_project',
                                        'params': {'parentPath': '/fixture'}}) + '\n', output, project)
        self.assertEqual(json.loads(data), {'id': 1, 'result': project})


if __name__ == '__main__':
    unittest.main()
