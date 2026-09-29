"""JSON-lines Studio service. stdout is protocol only; one response per line."""
from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
from adapter import AdapterError, ProjectAdapter


def dispatch(adapter: ProjectAdapter, request: object):
    if not isinstance(request, dict) or set(request) != {"id", "method", "params"}:
        raise AdapterError("Mensagem de serviço inválida.", "INVALID_REQUEST")
    if not isinstance(request["id"], (str, int)) or type(request["id"]) is bool:
        raise AdapterError("Identificador inválido.", "INVALID_REQUEST")
    method, params = request["method"], request["params"]
    if not isinstance(params, dict):
        raise AdapterError("Parâmetros inválidos.", "INVALID_REQUEST")
    if method == "open_project" and set(params) == {"parentPath"}:
        project = adapter.open_project(params["parentPath"])
        adapter.invoke("structure_prepare", {})
        return project
    if method == "refresh_project" and not params:
        project = adapter.refresh_project()
        adapter.invoke("structure_prepare", {})
        return project
    if method == "render":
        return adapter.render(params)
    return adapter.invoke(method, params)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", type=Path)
    args = parser.parse_args()
    adapter = ProjectAdapter(args.state_dir)
    for line in sys.stdin:
        request_id = None
        try:
            # Read the identifier before rejecting the message: an error that loses
            # its id cannot be matched to a pending request, and the caller sees an
            # unexplained protocol failure instead of the real reason.
            request = json.loads(line)
            request_id = request.get("id") if isinstance(request, dict) else None
            if len(line) > 1_000_000:
                raise AdapterError("Mensagem muito grande.", "INVALID_REQUEST")
            with redirect_stdout(sys.stderr):
                result = dispatch(adapter, request)
            response = {"id": request_id, "result": result}
        except AdapterError as exc:
            response = {"id": request_id, "error": {"message": str(exc), "code": exc.code}}
        except Exception as exc:
            response = {"id": request_id, "error": {"message": f"Falha ao ler o projeto: {exc}", "code": "WORKER_ERROR"}}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
