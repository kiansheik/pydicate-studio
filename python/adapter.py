"""Read-only corpus inspection and a deliberately small, typed engine adapter.

Corpus Python is parsed, never imported or evaluated. Studio owns the optional
UUID sidecar; it never writes source, records, a Git index, or engine files.
"""
from __future__ import annotations

import ast
import hashlib
import io
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tokenize
import uuid

ADAPTER_VERSION = "studio-authoring-v2"
ANALYSIS_KEYS = {"kind", "predicate", "subject", "object", "hiddenSubject", "mood", "negated"}
ENGINE_ROOTS = ("pydicate", "tupi")
CORPUS_ROOTS = ("historic", "ground_truth/records/historic", "authoring")


class AdapterError(Exception):
    def __init__(self, message: str, code: str = "PROJECT_ERROR"):
        super().__init__(message)
        self.code = code


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def validate_analysis(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != ANALYSIS_KEYS:
        raise AdapterError("A análise deve usar somente os campos da construção disponível.", "INVALID_ANALYSIS")
    fixed = {"kind": "imperative", "predicate": "apiti", "subject": "nde", "object": "moro"}
    if any(value.get(key) != expected for key, expected in fixed.items()):
        raise AdapterError("Esta versão realiza apenas a construção apiti / nde / moro.", "INVALID_ANALYSIS")
    if type(value["hiddenSubject"]) is not bool or type(value["negated"]) is not bool:
        raise AdapterError("Os controles de sujeito e negação devem ser booleanos.", "INVALID_ANALYSIS")
    if value["mood"] not in ("imperative", "indicative"):
        raise AdapterError("Modo verbal desconhecido.", "INVALID_ANALYSIS")
    return dict(value)


def expression_for(analysis: dict) -> str:
    analysis = validate_analysis(analysis)
    expression = f"({'+' if analysis['hiddenSubject'] else ''}nde * apiti * moro)"
    if analysis["mood"] == "imperative":
        expression += ".imp()"
    return ("-" if analysis["negated"] else "") + expression


def parse_analysis(expression: str) -> dict | None:
    """Recognize syntax only; no names, attributes, or calls are executed."""
    try:
        node = ast.parse(expression, mode="eval").body
    except SyntaxError:
        return None
    negated = isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub)
    if negated:
        node = node.operand
    mood = "indicative"
    if (isinstance(node, ast.Call) and not node.args and not node.keywords
            and isinstance(node.func, ast.Attribute) and node.func.attr == "imp"):
        node = node.func.value
        mood = "imperative"
    if not (isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult)
            and isinstance(node.right, ast.Name) and node.right.id == "moro"):
        return None
    node = node.left
    if not (isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult)
            and isinstance(node.right, ast.Name) and node.right.id == "apiti"):
        return None
    subject = node.left
    hidden = isinstance(subject, ast.UnaryOp) and isinstance(subject.op, ast.UAdd)
    if hidden:
        subject = subject.operand
    if not isinstance(subject, ast.Name) or subject.id != "nde":
        return None
    return {"kind": "imperative", "predicate": "apiti", "subject": "nde", "object": "moro",
            "hiddenSubject": hidden, "mood": mood, "negated": negated}


def _git(root: Path, *args: str, binary: bool = False):
    try:
        result = subprocess.run(["git", "-C", str(root), *args], capture_output=True,
                                check=True, timeout=15, env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"})
    except (OSError, subprocess.SubprocessError) as exc:
        raise AdapterError(f"Não foi possível ler o repositório {root.name}: {exc}", "GIT_ERROR") from exc
    return result.stdout if binary else result.stdout.decode("utf-8").strip()


def repository_snapshot(root: Path, roots: tuple[str, ...]) -> dict:
    if Path(_git(root, "rev-parse", "--show-toplevel")).resolve() != root.resolve():
        raise AdapterError(f"{root.name} precisa ser a raiz de um clone Git.")
    revision = _git(root, "rev-parse", "HEAD")
    paths = _git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", *roots, binary=True)
    hasher = hashlib.sha256()
    hasher.update(b"studio-repository-content-v1\0")
    hasher.update(revision.encode())
    for raw_path in sorted(set(paths.split(b"\0")) - {b""}):
        path = root / os.fsdecode(raw_path)
        if "__pycache__" in path.parts or path.suffix in (".pyc", ".pyo"):
            continue
        if not path.resolve().is_relative_to(root.resolve()):
            raise AdapterError(f"Arquivo fora do clone: {path.name}")
        hasher.update(b"\0" + raw_path + b"\0")
        if not path.exists():
            hasher.update(b"DELETED")
        elif path.is_file():
            with path.open("rb") as handle:
                while block := handle.read(1024 * 1024):
                    hasher.update(block)
    return {"name": root.name, "path": str(root), "revision": revision,
            "branch": _git(root, "rev-parse", "--abbrev-ref", "HEAD"),
            "dirty": bool(_git(root, "status", "--porcelain", "--untracked-files=normal")),
            "fingerprint": "sha256:" + hasher.hexdigest()}


def _offset(text: str, position: tuple[int, int]) -> int:
    lines = text.splitlines(keepends=True)
    return sum(len(line) for line in lines[:position[0] - 1]) + position[1]


def _collection_elements(text: str, node: ast.List | ast.Tuple) -> list[str]:
    """Keep written parentheses and inner comments, rather than ast.unparse."""
    segment = ast.get_source_segment(text, node)
    if segment is None:
        raise AdapterError("Não foi possível preservar o trecho de origem.")
    tokens = list(tokenize.generate_tokens(io.StringIO(segment).readline))
    depth = 0
    start = None
    pieces = []
    for token in tokens:
        if token.type != tokenize.OP:
            continue
        if token.string in "([{":
            depth += 1
            if depth == 1:
                start = _offset(segment, token.end)
        elif token.string in ")]}":
            depth -= 1
            if depth == 0 and start is not None:
                piece = segment[start:_offset(segment, token.start)].strip()
                if piece and not all(line.lstrip().startswith("#") for line in piece.splitlines()):
                    pieces.append(piece)
        elif token.string == "," and depth == 1 and start is not None:
            pieces.append(segment[start:_offset(segment, token.start)].strip())
            start = _offset(segment, token.end)
    if len(pieces) != len(node.elts):
        raise AdapterError("Coleção desconhecida: mantida somente no arquivo de origem.")
    return pieces


def source_expressions(path: Path) -> list[dict]:
    """Inspect top-level source lists and additions without importing a corpus."""
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, filename=str(path))
    source = path.name.removesuffix(".tu.py")
    candidates = []
    for statement in tree.body:
        if (isinstance(statement, ast.Assign) and len(statement.targets) == 1
                and isinstance(statement.targets[0], ast.Name)
                and isinstance(statement.value, (ast.List, ast.Tuple))):
            candidates.append((statement.targets[0].id, statement.value))
    selected = next((entry for entry in candidates if entry[0] == source), None)
    selected = selected or next((entry for entry in candidates if entry[0] == "l"), None)
    if selected is None and len(candidates) == 1:
        selected = candidates[0]
    if selected is None:
        raise AdapterError(f"{path.name}: lista inicial não reconhecida.")
    name, collection = selected
    # Refuse the visual slice if its names have contextual redefinitions. Its
    # syntax can still be shown verbatim, but a fixed lexicon adapter would no
    # longer represent the written source faithfully.
    protected = {"apiti", "nde", "moro"}
    redefined = any(isinstance(node, ast.Name) and isinstance(node.ctx, (ast.Store, ast.Del))
                    and node.id in protected for node in ast.walk(tree))
    redefined = redefined or any(isinstance(node, ast.Attribute) and isinstance(node.ctx, (ast.Store, ast.Del))
                                and isinstance(node.value, ast.Name) and node.value.id in protected
                                for node in ast.walk(tree))
    expressions = [{"expression": value, "line": node.lineno}
                   for value, node in zip(_collection_elements(text, collection), collection.elts)]
    for statement in tree.body:
        if (isinstance(statement, ast.AugAssign) and isinstance(statement.target, ast.Name)
                and statement.target.id == name and isinstance(statement.op, ast.Add)):
            if isinstance(statement.value, (ast.List, ast.Tuple)):
                expressions.extend({"expression": value, "line": node.lineno}
                                   for value, node in zip(_collection_elements(text, statement.value), statement.value.elts))
            else:
                segment = ast.get_source_segment(text, statement)
                assert segment is not None
                operator = next(token for token in tokenize.generate_tokens(io.StringIO(segment).readline)
                                if token.type == tokenize.OP and token.string == "+=")
                expressions.append({"expression": segment[_offset(segment, operator.end):].lstrip(),
                                    "line": statement.lineno})
    for entry in expressions:
        entry["contextualOverride"] = redefined
    return expressions


def load_records(path: Path) -> tuple[dict[int, dict], list[str]]:
    records = {}
    diagnostics = []
    if not path.is_file():
        return records, diagnostics
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            ordinal = record.get("ordinal")
            if type(ordinal) is not int or ordinal < 1 or ordinal in records:
                raise ValueError("ordinal ausente ou duplicado")
            records[ordinal] = record
        except (ValueError, AttributeError) as exc:
            diagnostics.append(f"{path.name}:{number}: referência não carregada ({exc}).")
    return records, diagnostics


class IdentityRegistry:
    """Studio IDs, not a claimed migration of the corpus review identity schema.

    Exact unique expressions retain UUIDs after moves. An external rewrite gets
    a new identity so an old draft cannot silently attach to different source.
    Duplicate expressions are scoped to the full source revision conservatively.
    """
    def __init__(self, state_dir: Path | None, project_id: str):
        self.path = state_dir / f"{project_id}.ids.json" if state_dir else None
        self.ids = {}
        self.sources = {}
        if self.path and self.path.is_file():
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
                if payload.get("version") != 1 or not isinstance(payload.get("ids"), dict):
                    raise ValueError("schema")
                if not all(isinstance(k, str) and isinstance(v, str) for k, v in payload["ids"].items()):
                    raise ValueError("identifiers")
                self.ids = payload["ids"]
                self.sources = payload.get("sources", {}) if isinstance(payload.get("sources", {}), dict) else {}
            except (ValueError, AttributeError) as exc:
                raise AdapterError("O registro de identidades do Studio está inválido; os rascunhos foram preservados.", "STATE_ERROR") from exc

    def identifier(self, key: str) -> str:
        if key not in self.ids:
            self.ids[key] = "passage:" + str(uuid.uuid4()) if self.path else "provisional:" + digest(key.encode())
        return self.ids[key]

    def reconcile(self, source, fingerprints, entries):
        previous = self.sources.get(source, [])
        if not isinstance(previous, list) or not all(isinstance(item, dict) and isinstance(item.get('fingerprint'), str) and isinstance(item.get('id'), str) for item in previous): return {}
        old = [item['fingerprint'] for item in previous]
        # Source-only comments or lexical definitions can change without any
        # expression edit. Preserve the whole sequence, including duplicates.
        if old == fingerprints:
            mapping = {index:item['id'] for index,item in enumerate(previous)}
            # Distinct nearby comments are additional evidence when identical
            # written expressions trade places; never use line numbers alone.
            for fingerprint in set(old):
                if old.count(fingerprint) < 2: continue
                old_context = {(item.get('context') or ''): item['id'] for item in previous if item['fingerprint']==fingerprint}
                contexts = [entry.get('commentBlock','') for fp,entry in zip(fingerprints,entries) if fp==fingerprint]
                if len(old_context)==old.count(fingerprint) and len(set(contexts))==len(contexts) and set(contexts)==set(old_context):
                    for index,(fp,entry) in enumerate(zip(fingerprints,entries)):
                        if fp==fingerprint:mapping[index]=old_context[entry.get('commentBlock','')]
            return mapping
        if len(old) == len(fingerprints):
            stationary = {}
            for fingerprint in set(old):
                previous_positions = [i for i,value in enumerate(old) if value==fingerprint]
                current_positions = [i for i,value in enumerate(fingerprints) if value==fingerprint]
                if previous_positions == current_positions:
                    stationary.update({i:previous[i]['id'] for i in current_positions})
            return stationary
        # Keep only positions whose alignment is unique among all possible
        # subsequence matches. Insertion of another identical expression remains
        # ambiguous; inserting an unrelated line before duplicates does not.
        def align(short,long):
            early=[];position=0
            for value in short:
                while position<len(long) and long[position]!=value:position+=1
                if position==len(long):return None
                early.append(position);position+=1
            late=[];position=len(long)-1
            for value in reversed(short):
                while position>=0 and long[position]!=value:position-=1
                if position<0:return None
                late.append(position);position-=1
            late.reverse()
            return {index:start for index,(start,end) in enumerate(zip(early,late)) if start==end}
        inserted=align(old,fingerprints)
        if inserted is not None:return {new:previous[old_index]['id'] for old_index,new in inserted.items()}
        removed=align(fingerprints,old)
        if removed is not None:return {new:previous[old_index]['id'] for new,old_index in removed.items()}
        return {}

    def save(self):
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps({"version": 1, "ids": self.ids, "sources": self.sources}, ensure_ascii=False), encoding="utf-8")
            os.replace(temporary, self.path)


def _string(value: object) -> str:
    return value if isinstance(value, str) else ""


class ProjectAdapter:
    def __init__(self, state_dir: Path | None = None):
        self.state_dir = state_dir.resolve() if state_dir else None
        self.parent: Path | None = None
        self.project: dict | None = None

    def invoke(self, method: str, params: dict):
        from authoring_service import AuthoringService
        return AuthoringService(self).invoke(method, params)

    def _snapshots(self) -> list[dict]:
        assert self.parent
        return [repository_snapshot(self.parent / "oldtupicorpus", CORPUS_ROOTS),
                repository_snapshot(self.parent / "nhe-enga", ENGINE_ROOTS)]

    @staticmethod
    def _engine_fingerprint(snapshots: list[dict]) -> str:
        # Corpus fingerprint includes lexicon definitions; no clean-HEAD claim.
        runtime_files = ('adapter.py', 'authoring_runtime.py', 'authoring_service.py', 'studio_authoring.py', 'navarro_search.py', 'active_lexicon.py', 'rendered_structures.py', 'lexical_metadata.py', 'semantic_context.py', 'node_definitions.py', 'lexical_publication.py', 'publication_regression.py', 'reviewed_files.py', 'worker.py')
        implementation = digest(b"".join((Path(__file__).parent / name).read_bytes() for name in runtime_files))
        material = ADAPTER_VERSION + ":" + sys.version + ":" + implementation + ":" + ":".join(item["fingerprint"] for item in snapshots)
        return "sha256:" + digest(material.encode())

    def open_project(self, parent_path: str) -> dict:
        if not isinstance(parent_path, str) or not parent_path.strip() or len(parent_path) > 4096:
            raise AdapterError("Escolha a pasta que contém oldtupicorpus e nhe-enga.", "INVALID_REQUEST")
        parent = Path(parent_path).expanduser().resolve()
        corpus = parent / "oldtupicorpus"
        engine = parent / "nhe-enga"
        for path in [corpus / "historic", engine / "pydicate/pydicate", engine / "tupi/tupi"]:
            if not path.is_dir():
                raise AdapterError("A pasta precisa conter os clones oldtupicorpus e nhe-enga com seus módulos Python.", "PROJECT_NOT_FOUND")
        if self.state_dir and any(self.state_dir.is_relative_to(repo.resolve()) for repo in (corpus, engine)):
            raise AdapterError("O estado do Studio não pode ficar dentro dos repositórios de origem.", "STATE_ERROR")
        previous_parent = self.parent
        self.parent = parent
        try:
            return self.refresh_project()
        except Exception:
            self.parent = previous_parent
            raise

    def refresh_project(self) -> dict:
        if self.parent is None:
            raise AdapterError("Abra um projeto antes de atualizar.", "NO_PROJECT")
        snapshots = self._snapshots()
        corpus = self.parent / "oldtupicorpus"
        project_id = "local-" + digest(str(corpus.resolve()).encode())[:24]
        registry = IdentityRegistry(self.state_dir, project_id)
        diagnostics = ["Referências salvas são bases legadas por posição; não comprovam aprovação humana nem correspondência com alterações externas.",
                       "O editor preserva a sintaxe concreta; capacidades estruturais e realização da gramática são verificadas separadamente."]
        diagnostics.append("Identidades locais preservam alinhamentos inequívocos; alterações e duplicatas ambíguas recebem novos vínculos para preservar rascunhos anteriores."
                           if self.state_dir else "Identidades provisórias por conteúdo: configure o diretório de estado do Studio para persistir identificadores locais.")
        passages = []
        for path in sorted((corpus / "historic").glob("*.tu.py")):
            if path.name == "lexicon.tu.py" or "bettendorff" in path.name:
                continue
            source = path.name.removesuffix(".tu.py")
            try:
                legacy_entries = source_expressions(path)
                from studio_authoring import source_entries as concrete_entries, authoritative_metadata
                entries = concrete_entries(path)
                for entry, legacy in zip(entries, legacy_entries): entry['contextualOverride'] = legacy['contextualOverride']
                try:
                    metadata_by_ordinal = authoritative_metadata(corpus, path) if (corpus / 'authoring/source_annotations.py').is_file() else {}
                except Exception as metadata_error:
                    metadata_by_ordinal = {}
                    diagnostics.append(f"{path.name}: metadados autoritativos indisponíveis: {metadata_error}")
                from passage_references import read as read_references
                records, record_diagnostics = load_records(corpus / "ground_truth/records/historic" / f"{source}.jsonl")
                try: records = read_references(corpus, source)
                except (ValueError, OSError, TypeError, KeyError) as error:
                    record_diagnostics.append(f"{source}: referências independentes indisponíveis ({error}); arquivo preservado.")
                diagnostics.extend(record_diagnostics)
            except (OSError, ValueError, SyntaxError, tokenize.TokenError, AdapterError) as exc:
                diagnostics.append(f"{path.name}: leitura indisponível ({exc}). Outros documentos continuam disponíveis.")
                continue
            file_hash = digest(path.read_bytes())
            fingerprints = [digest(entry["expression"].encode()) for entry in entries]
            reconciled_ids = registry.reconcile(source, fingerprints, entries)
            source_identities = []
            explicit_ids = [(entry.get('studio') or {}).get('passageId') for entry in entries]
            seen = {}
            missing = 0
            for ordinal, (entry, fingerprint) in enumerate(zip(entries, fingerprints), start=1):
                seen[fingerprint] = seen.get(fingerprint, 0) + 1
                duplicate = f":{file_hash}:{seen[fingerprint]}" if fingerprints.count(fingerprint) > 1 else ""
                studio_identity = (entry.get('studio') or {}).get('passageId')
                if studio_identity and explicit_ids.count(studio_identity) > 1:
                    diagnostics.append(f"{source}:{ordinal}: identidade explícita duplicada; novo vínculo provisório requer conciliação.")
                    studio_identity = None
                identifier = studio_identity if isinstance(studio_identity, str) and studio_identity.startswith('passage:') else reconciled_ids.get(ordinal - 1) or registry.identifier(f"{source}:{fingerprint}{duplicate}")
                source_identities.append({'fingerprint': fingerprint, 'id': identifier, 'context': entry.get('commentBlock', '')})
                record = records.get(ordinal, {})
                if record.get("studio_passage_id", identifier) != identifier:
                    diagnostics.append(f"{source}:{ordinal}: referência de outra identidade preservada sem reassociação.")
                    record = {}
                saved = _string(record.get("normalized_target")) or _string(record.get("surface")) or None
                if saved is None:
                    missing += 1
                source_metadata = metadata_by_ordinal.get(ordinal, {})
                # Upstream optional fields normalize a blank directive to None.
                # Presence still matters: an explicit empty @translation clears
                # a legacy value instead of resurrecting it on refresh.
                explicit_fields=set();found_directive=False
                for comment in reversed(entry.get('commentBlock','').splitlines()):
                    if not comment.strip():
                        if found_directive:continue
                        break
                    directive=re.match(r'^\s*#\s*@([a-z][a-z0-9_-]*)\s*(.*?)\s*$',comment,re.IGNORECASE)
                    if not directive:break
                    found_directive=True;explicit_fields.add(directive.group(1).lower())
                def scholarly_field(field,directive):
                    if directive in explicit_fields:return _string(source_metadata.get(field))
                    value=source_metadata.get(field)
                    return _string(value if value is not None else record.get(field))
                locations = source_metadata.get('locations') or record.get("locations")
                location = locations[-1] if isinstance(locations, (list, tuple)) and locations and isinstance(locations[-1], dict) else {}
                page = _string(location.get("page_start")) or None
                if page and location.get("page_end"):
                    page += "–" + str(location["page_end"])
                title = "Araújo · Catecismo" if source == "araujo_catecismo_1686" else source.replace("_", " ")
                notes = source_metadata.get("notes") if source_metadata.get("notes") is not None else record.get("notes")
                if isinstance(notes, (list, tuple)): notes = [note for note in notes if not str(note).startswith(("studio:v1 ", "studio-lexical:v1 "))]
                # Draft conflicts include scholarly metadata, while identity
                # matching remains based on expressions and explicit IDs. Machine
                # pointers and physical line movement do not invalidate a draft.
                relevant_metadata = {key:value for key,value in source_metadata.items() if key not in {'source_line','status','notes'} and value}
                human_source_notes = [note for note in source_metadata.get('notes',[]) if not str(note).startswith(('studio:v1 ','studio-lexical:v1 '))]
                if human_source_notes: relevant_metadata['notes'] = human_source_notes
                cleared_fields=[directive for field,directive in [('diplomatic','diplomatic'),('normalized_target','target'),('translation','translation')] if directive in explicit_fields and source_metadata.get(field) is None]
                if cleared_fields:relevant_metadata['clearedFields']=cleared_fields
                translations = (entry.get('studio') or {}).get('translations')
                if translations is not None:
                    from studio_authoring import validate_translations
                    translations = validate_translations(translations)
                    relevant_metadata['translations'] = translations
                editorial_fingerprint = digest(json.dumps({'expression':entry['expression'],'metadata':relevant_metadata},ensure_ascii=False,sort_keys=True).encode('utf-8'))
                passages.append({"id": identifier, "legacyId": f"{source}:{ordinal:04d}", "sourceId": source,
                    "ordinal": ordinal, "sourceLine": entry["statementLine"], "sourceEndLine": entry["endLine"], "sourceFileFingerprint": "sha256:" + file_hash, "sourceMetadata": source_metadata, "studioMetadata": entry.get("studio"), "title": f"{title} · {ordinal:04d}", "sourceExpression": entry["expression"],
                    "sourceFingerprint": "sha256:" + editorial_fingerprint,
                    "legacyExpressionFingerprint": "sha256:" + hashlib.sha256(entry['expression'].encode()).hexdigest(), "acceptedReference": saved,
                    "referenceProvenance": "legacy" if saved is not None else "none",
                    "diplomatic": scholarly_field("diplomatic","diplomatic"), "normalized": scholarly_field("normalized_target","target"),
                    "translation": scholarly_field("translation","translation"),
                    **({'translations': translations} if translations is not None else {}),
                    "notes": "\n".join(str(note) for note in notes) if isinstance(notes, (list, tuple)) else "",
                    "witness": {"title": _string(location.get("witness")) or title,
                                "year": "1686" if source == "araujo_catecismo_1686" else "",
                                "printedPage": page, "pdfPage": None, "region": None, "folio": location.get("folio_start"), "textualLine": location.get("line_start"), "section": location.get("section"), "subsection": location.get("subsection")},
                    "status": "analysis" if saved is not None else "untranscribed",
                    "analysis": None if entry["contextualOverride"] else parse_analysis(entry["expression"])})
            registry.sources[source] = source_identities
            if missing:
                diagnostics.append(f"{path.name}: {missing} expressão(ões) sem referência salva; nenhuma referência foi gerada.")
            if len(records) > len(entries):
                diagnostics.append(f"{path.name}: há mais referências do que expressões; o vínculo por posição requer revisão.")
        if not passages:
            details = " ".join(diagnostics[3:])[:3000]
            raise AdapterError("Nenhuma passagem pôde ser lida em historic/*.tu.py. Verifique os arquivos do projeto. " + details,
                               "NO_PASSAGES")
        if self._engine_fingerprint(self._snapshots()) != self._engine_fingerprint(snapshots):
            raise AdapterError("Os arquivos mudaram durante a leitura. Atualize o projeto.", "STALE_PROJECT")
        registry.save()
        project = {"id": project_id, "name": "Corpus local de tupi antigo", "mode": "local", "passages": passages,
                   "repositories": snapshots, "engineFingerprint": self._engine_fingerprint(snapshots), "diagnostics": diagnostics}
        self.project = project
        return project

    def render(self, request: dict) -> dict:
        if not isinstance(request, dict) or set(request) != {"revisionId", "engineFingerprint", "analysis"}:
            raise AdapterError("Pedido de realização inválido.", "INVALID_REQUEST")
        analysis = validate_analysis(request["analysis"])
        if not isinstance(request["revisionId"], str) or not 0 < len(request["revisionId"]) <= 200:
            raise AdapterError("Revisão de rascunho inválida.", "INVALID_REQUEST")
        if self.project is None or self.parent is None:
            raise AdapterError("Abra um projeto antes de realizar a análise.", "NO_PROJECT")
        fingerprint = self._engine_fingerprint(self._snapshots())
        if request["engineFingerprint"] != fingerprint or self.project["engineFingerprint"] != fingerprint:
            raise AdapterError("O projeto ou a gramática mudou. Atualize o projeto antes de realizar novamente.", "STALE_ENGINE")
        lexicon = self.parent / "oldtupicorpus/historic/lexicon.tu.py"
        lexicon_tree = ast.parse(lexicon.read_text(encoding="utf-8"), filename=str(lexicon))
        definitions = [node.value for node in lexicon_tree.body if isinstance(node, ast.Assign)
                       and any(isinstance(target, ast.Name) and target.id == "apiti" for target in node.targets)]
        if len(definitions) != 1:
            raise AdapterError("A entrada apiti do léxico não é compatível com esta construção.", "INCOMPATIBLE_ENGINE")
        definition = definitions[0]
        if not (isinstance(definition, ast.Call) and isinstance(definition.func, ast.Name)
                and definition.func.id == "Verb" and len(definition.args) == 1
                and isinstance(definition.args[0], ast.Constant) and definition.args[0].value == "apiti"
                and len(definition.keywords) == 1 and definition.keywords[0].arg == "definition"
                and isinstance(definition.keywords[0].value, ast.Constant)
                and isinstance(definition.keywords[0].value.value, str)):
            raise AdapterError("A definição de apiti mudou; este adaptador precisa de revisão.", "INCOMPATIBLE_ENGINE")
        payload = {"enginePath": str(self.parent / "nhe-enga"), "definition": definition.keywords[0].value.value,
                   "analysis": analysis}
        try:
            process = subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("engine_render.py"))],
                                     input=json.dumps(payload), capture_output=True, text=True, timeout=30)
            if process.returncode:
                raise AdapterError("A gramática local não pôde realizar esta construção: " + process.stderr.strip()[-1200:], "INCOMPATIBLE_ENGINE")
            result = json.loads(process.stdout)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            raise AdapterError(f"Não foi possível iniciar a gramática Python: {exc}", "ENGINE_ERROR") from exc
        if self._engine_fingerprint(self._snapshots()) != fingerprint:
            raise AdapterError("A gramática mudou durante a realização. Atualize o projeto.", "STALE_ENGINE")
        return {"revisionId": request["revisionId"], "engineFingerprint": fingerprint,
                "expression": expression_for(analysis), **result, "origin": "engine"}
