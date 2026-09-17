"""Reviewable corpus application actions over exact source bytes."""
from __future__ import annotations
import ast
import difflib
import hashlib
import json
import keyword
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata
import uuid
from studio_authoring import authoritative_metadata, expression_tree, source_entries, parse_ast, contains_slots


def digest(data): return 'sha256:' + hashlib.sha256(data).hexdigest()


class AuthoringService:
    def __init__(self, adapter):
        self.adapter=adapter
        if not hasattr(adapter,'previews'): adapter.previews={}

    @property
    def corpus(self):
        self.require_project(); return self.adapter.parent/'oldtupicorpus'

    def require_project(self):
        if self.adapter.project is None: self.error('Abra o projeto local primeiro.','NO_PROJECT')

    def error(self,message,code='INVALID_REQUEST'):
        from adapter import AdapterError
        raise AdapterError(message,code)

    def passage(self, params):
        self.require_project()
        passage=next((p for p in self.adapter.project['passages'] if p['id']==params.get('passageId')),None)
        if passage is None: self.error('Passagem não encontrada; atualize o projeto.','PASSAGE_NOT_FOUND')
        return passage

    def source(self, passage): return self.corpus/'historic'/f"{passage['sourceId']}.tu.py"

    def fresh(self, params=None):
        self.require_project()
        fingerprint=self.adapter._engine_fingerprint(self.adapter._snapshots())
        if fingerprint != self.adapter.project['engineFingerprint'] or (params and params.get('engineFingerprint',fingerprint)!=fingerprint): self.error('O corpus ou a gramática mudou. Atualize e reconcilie o rascunho.','STALE_ENGINE')
        return fingerprint

    def child(self,payload,timeout=45):
        payload={'parent':str(self.adapter.parent),**payload}
        try:
            run=subprocess.run([sys.executable,'-I','-B',str(Path(__file__).with_name('authoring_runtime.py'))],input=json.dumps(payload),capture_output=True,text=True,timeout=timeout)
            if run.returncode: self.error(run.stderr[-2000:] or 'Processo de gramática falhou.','ENGINE_ERROR')
            response=json.loads(run.stdout)
        except (OSError,subprocess.SubprocessError,ValueError) as error: self.error(str(error),'ENGINE_ERROR')
        if 'error' in response: self.error(response['error']['message'],response['error']['code'])
        return response['result']

    def invoke(self,method,params):
        allowed={'parse_expression','evaluate_expression','predicate_catalog','predicate_create','source_preview','source_new_preview','source_apply','source_recover','source_recovery_list','lexicon_search','lexicon_inspect','lexicon_create','lexicon_update','assistant_context','reference_verify','reference_approve','reference_status','passage_lexicon','contribution_prepare','dictionary_search','dictionary_lookup','dictionary_predicate','structure_search','structure_resolve'}
        if method not in allowed: self.error('Operação indisponível.','UNKNOWN_METHOD')
        if not isinstance(params,dict): self.error('Parâmetros inválidos.')
        return getattr(self,method)(params)

    def parse_expression(self,params):
        raw=params.get('raw')
        if not isinstance(raw,str) or len(raw)>100000: self.error('Expressão ausente ou muito grande.')
        return expression_tree(raw,params.get('revisionId',''))

    def evaluate_expression(self,params):
        context=self.structure_context(params); fingerprint=self.fresh(params)
        raw=params.get('raw')
        if not isinstance(raw,str) or len(raw)>100000: self.error('Expressão ausente ou muito grande.')
        result=self.child({**context,'raw':raw})
        self.fresh(params)
        result.pop('structure',None)
        return {'revisionId':params.get('revisionId',''),'engineFingerprint':fingerprint,'expression':raw,'origin':'engine',**result}

    def predicate_catalog(self,params):
        context=self.structure_context(params); fingerprint=self.fresh(params)
        result=self.child({'action':'predicate_catalog',**context})
        self.fresh(params)
        return {'engineFingerprint':fingerprint,**result}

    def predicate_create(self,params):
        context=self.structure_context(params); fingerprint=self.fresh(params)
        if not isinstance(params.get('constructor'),str) or len(params['constructor'])>100:
            self.error('Selecione um tipo de predicado disponível.')
        if not isinstance(params.get('values'),dict) or len(params['values'])>30:
            self.error('Propriedades do predicado inválidas.')
        result=self.child({'action':'predicate_create',**context,'constructor':params['constructor'],'values':params['values']})
        self.fresh(params)
        result.pop('structure',None)
        return {'revisionId':params.get('revisionId',''),'engineFingerprint':fingerprint,'origin':'engine',**result}

    def _preview(self,path,before,after,**details):
        # A copy with an occurrence gloss has an explicit source-local helper;
        # the resulting file never depends on an invisible Studio builtin.
        decoded = after.decode('utf-8')
        parsed_file = ast.parse(decoded,filename=str(path))
        needs_define = any(isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='studio_define' for node in ast.walk(parsed_file))
        has_define = any(isinstance(node,ast.FunctionDef) and node.name=='studio_define' for node in parsed_file.body)
        if needs_define and not has_define:
            initial = next((node for node in parsed_file.body if isinstance(node,ast.Assign) and isinstance(node.value,(ast.List,ast.Tuple)) and any(isinstance(t,ast.Name) and t.id=='l' for t in node.targets)),None)
            offset = sum(map(len,decoded.splitlines(keepends=True)[:initial.lineno-1])) if initial else 0
            helper = 'def studio_define(value, definition):\n    result = value.copy()\n    result.definition = definition\n    return result\n\n'
            after = (decoded[:offset]+helper+decoded[offset:]).encode('utf-8')
        # Verify resulting source syntax before making a reviewable patch.
        ast.parse(after.decode('utf-8'),filename=str(path))
        preview_id=str(uuid.uuid4())
        difference=''.join(difflib.unified_diff(before.decode('utf-8').splitlines(keepends=True),after.decode('utf-8').splitlines(keepends=True),fromfile=str(path),tofile=str(path)))
        result={'previewId':preview_id,'diff':difference,'sourceFingerprint':digest(before),'path':str(path),'kind':'new-passage' if details.get('newPassage') else 'source' if details.get('passageId') else 'lexicon' if details.get('lexicalId') else 'recovery','targetPassageId':details.get('passageId'),**details}
        self.adapter.previews[preview_id]={'path':path,'before':before,'after':after,**result}
        return result

    def hierarchy_metadata(self,metadata,current):
        """Preserve upstream cumulative section semantics in a reviewed patch.

        An explicit section clears the previous subsection. Empty directives
        themselves are omissions upstream, so never pretend they reset context.
        """
        result=dict(metadata)
        for key in ('section','subsection'):
            if key in result:
                if not isinstance(result[key],str):
                    self.error(f'{key}: texto esperado.')
                result[key]=result[key].strip()
        section=result.get('section',current.get('section') or '')
        if 'section' in result and not section and current.get('section'):
            self.error('A fonte herda a seção anterior e o formato atual do corpus não permite apagá-la. O campo vazio continua no rascunho; indique outra seção antes de aplicar à fonte.', 'LOCATOR_RESET_UNSUPPORTED')
        if result.get('subsection')=='' and current.get('subsection'):
            if not section:
                self.error('A fonte não permite apagar uma subseção herdada sem uma seção explícita. O campo vazio continua no rascunho; indique uma seção antes de aplicar à fonte.', 'LOCATOR_RESET_UNSUPPORTED')
            result['section']=section
        return result

    def source_preview(self,params):
        passage=self.passage(params); self.fresh()
        path=self.source(passage); before=path.read_bytes(); text=before.decode('utf-8')
        entry=source_entries(path)[passage['ordinal']-1]
        raw=params.get('raw',entry['expression'])
        if not isinstance(raw,str): self.error('Expressão inválida.')
        parsed=expression_tree(raw)
        if not parsed['capabilities']['parse']: self.error('Salve como rascunho até corrigir a sintaxe; o arquivo exige expressão válida.','INVALID_SOURCE')
        if contains_slots(raw): self.error('Conecte todos os lugares vazios antes de aplicar à fonte. A construção incompleta pode continuar no rascunho.', 'UNRESOLVED_SLOTS')
        metadata=params.get('metadata') or {}
        if not isinstance(metadata,dict): self.error('Metadados inválidos.')
        if any(key not in {'diplomatic','normalized','target','translation','notes','analysis','uncertainty','evidence','printedPage','folio','line','section','subsection'} for key in metadata): self.error('Campo de metadados desconhecido.')
        existing = {key:passage.get(key,'') for key in ('diplomatic','normalized','translation','notes')}
        existing.update(target=passage.get('normalized',''), analysis=(passage.get('sourceMetadata') or {}).get('analysis') or '', evidence=(entry.get('studio') or {}).get('evidence'), uncertainty=(entry.get('studio') or {}).get('uncertainty',''))
        existing.update({key:passage.get('witness',{}).get(witness_key) or '' for key,witness_key in [('printedPage','printedPage'),('folio','folio'),('line','textualLine'),('section','section'),('subsection','subsection')]})
        requested_metadata=self.hierarchy_metadata(metadata,existing)
        metadata = {key:value for key,value in requested_metadata.items() if value != existing.get(key)}
        # Repeating an unchanged section is the upstream reset for a cleared
        # subsection. Conversely, an explicitly retained subsection must follow
        # a new section even when its text equals the earlier subsection.
        if requested_metadata.get('subsection')=='' and existing.get('subsection'):
            metadata['section']=requested_metadata['section']
        if 'section' in metadata and requested_metadata.get('subsection'):
            metadata['subsection']=requested_metadata['subsection']
        if raw==entry['expression'] and not metadata: return self._preview(path,before,before,passageId=passage['id'])
        newline='\r\n' if b'\r\n' in before else '\n'
        # A single supported upstream note stores the stable identity and the
        # versioned evidence pointer. Existing note and locators stay adjacent.
        studio=dict(entry.get('studio') or {}); studio['passageId']=passage['id']
        if 'evidence' in metadata: studio['evidence']=metadata['evidence']
        if 'uncertainty' in metadata: studio['uncertainty']=str(metadata['uncertainty'])
        # Concrete outer parentheses can start before the AST operand. A note
        # inserted at that inner AST line would overlap the source replacement.
        anchor_line = min(entry['statementLine'], entry.get('openingLine', entry['statementLine']))
        start_line=sum(len(line) for line in text.splitlines(keepends=True)[:anchor_line-1])
        indent=re.match(r'\s*',text[start_line:]).group(0).replace('\n','').replace('\r','')
        if text[start_line:entry['start']].lstrip().startswith('l +='): indent=text[start_line:entry['start']].split('l +=')[0]
        note=indent+'# @note studio:v1 '+json.dumps(studio,ensure_ascii=False,separators=(',',':'))+newline
        directives=[]
        mapping={'normalized':'target','printedPage':'page','notes':'note'}
        for key,value in metadata.items():
            if key in {'evidence','uncertainty'}: continue
            if not isinstance(value,str): self.error(f'{key}: texto esperado.')
            if '\n' in value or '\r' in value:
                if key=='notes':
                    directives.extend(indent+'# @note '+part+newline for part in value.splitlines()); continue
                self.error(f'{key}: use uma única linha no comentário de origem. O texto multilinha pode continuar salvo como rascunho.')
            directives.append(indent+'# @'+mapping.get(key,key)+' '+value+newline)
        # Remove only previous machine note in this immediately adjacent block;
        # preserve all other bytes. Insert metadata immediately before expression.
        replacement_raw = '(' + raw + '\n)' if text[start_line:entry['start']].lstrip().startswith('l +=') and '\n' in raw else raw
        is_collection_item = not text[start_line:entry['start']].lstrip().startswith(entry['collection'] + ' +=')
        if is_collection_item:
            # Upstream @ directives attach before the first AST token, not an
            # earlier line containing only an opening parenthesis. Join only
            # that whitespace prefix inside this explicitly reviewed edit so
            # external comments remain visible to the unchanged corpus parser.
            syntax=parse_ast(replacement_raw)
            if syntax.lineno>1:
                from studio_authoring import position
                first_token=position(replacement_raw,syntax.lineno,syntax.col_offset)
                prefix=replacement_raw[:first_token]
                if not re.fullmatch(r'[\s(]*',prefix):self.error('Comentários antes do primeiro operando precisam de revisão manual para vincular metadados. O rascunho foi preservado.','SOURCE_METADATA_ANCHOR')
                joined=re.sub(r'\s+','',prefix)+replacement_raw[first_token:]
                if ast.dump(parse_ast(joined))!=ast.dump(syntax):self.error('A âncora de metadados alteraria a estrutura; rascunho preservado.','SOURCE_METADATA_ANCHOR')
                replacement_raw=joined
        changes=[(entry['start'],entry['end'],replacement_raw),(start_line,start_line,''.join(directives)+note)]
        # Replace only edited directives in the authoritative adjacent block.
        # Other comments and inherited locators retain their original bytes.
        source_lines=text.splitlines(keepends=True)
        directive_aliases={'pages':'page','lines':'line','folios':'folio','sections':'section','subsections':'subsection'}
        edited_directives={mapping.get(key,key) for key in metadata if key not in {'evidence','uncertainty'}}
        line_index=anchor_line-2;found=False
        while line_index>=0:
            source_line=source_lines[line_index]
            if not source_line.strip():
                if not found:break
                line_index-=1;continue
            match=re.match(r'^\s*#\s*@([a-z][a-z0-9_-]*)\s*(.*?)\s*$',source_line,re.IGNORECASE)
            if not match:break
            found=True;key=directive_aliases.get(match.group(1).lower(),match.group(1).lower());value=match.group(2)
            machine=key=='note' and value.startswith(('studio:v1 ','studio-lexical:v1 '))
            if key=='note' and value.startswith('studio:v1 ') or key in edited_directives and not machine:
                beginning=sum(map(len,source_lines[:line_index]));changes.append((beginning,beginning+len(source_line),''))
            line_index-=1
        for start,end,replacement in sorted(changes,key=lambda x:x[0],reverse=True): text=text[:start]+replacement+text[end:]
        return self._preview(path,before,text.encode('utf-8'),passageId=passage['id'])

    def source_new_preview(self,params):
        self.fresh(); source_id=params.get('sourceId','araujo_catecismo_1686')
        if source_id!='araujo_catecismo_1686': self.error('Este marco cria passagens em Araújo.')
        raw=params.get('raw','')
        if not isinstance(raw,str) or not expression_tree(raw)['capabilities']['parse']: self.error('A nova expressão precisa ter sintaxe válida; texto incompleto pode ser salvo como rascunho.')
        if contains_slots(raw): self.error('Conecte todos os lugares vazios antes de aplicar à fonte. A construção incompleta pode continuar no rascunho.', 'UNRESOLVED_SLOTS')
        path=self.corpus/'historic'/f'{source_id}.tu.py'; before=path.read_bytes(); text=before.decode('utf-8')
        tree=ast.parse(text); anchor=next((s for s in tree.body if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id==source_id for t in s.targets)),None)
        offset=sum(map(len,text.splitlines(keepends=True)[:anchor.lineno-1])) if anchor else len(text)
        passage_id=params.get('newPassageId')
        if passage_id is None:passage_id='passage:'+str(uuid.uuid4())
        try:
            if not isinstance(passage_id,str) or not passage_id.startswith('passage:') or str(uuid.UUID(passage_id[8:]))!=passage_id[8:]:raise ValueError('Identidade não canônica')
        except (ValueError,AttributeError):self.error('Identidade de nova passagem inválida. Use passage:UUID.')
        if any(passage['id']==passage_id for passage in self.adapter.project['passages']):self.error('Esta identidade já pertence a uma passagem; revise a passagem existente.','PASSAGE_ID_EXISTS')
        metadata=params.get('metadata') or {}
        if not isinstance(metadata,dict):self.error('Metadados precisam ser um objeto.')
        prior=next((passage for passage in reversed(self.adapter.project['passages'])
                    if passage['sourceId']==source_id and (anchor is None or passage['sourceLine']<anchor.lineno)),None)
        metadata=self.hierarchy_metadata(metadata,(prior or {}).get('witness',{}))
        studio={'passageId':passage_id}
        if 'evidence' in metadata:
            evidence=metadata['evidence']
            if not isinstance(evidence,dict) or set(evidence)!={'version','assetId','passageId'} or type(evidence.get('version')) is not int or evidence['version']!=1 or evidence.get('passageId')!=passage_id or not isinstance(evidence.get('assetId'),str) or not re.fullmatch(r'[a-f0-9]{64}',evidence['assetId']):self.error('A evidência precisa ter versão 1, SHA-256 do PDF e a mesma identidade da nova passagem.')
            studio['evidence']=dict(evidence)
        mapping={'diplomatic':'diplomatic','normalized':'target','translation':'translation','notes':'note','printedPage':'page','folio':'folio','line':'line','section':'section','subsection':'subsection'}
        directives=[]
        for key, directive in mapping.items():
            if metadata.get(key):
                value=metadata[key]
                if not isinstance(value,str):self.error('Metadados precisam ser texto.')
                if key!='notes' and ('\n' in value or '\r' in value):self.error(f'{key}: use uma única linha no comentário de origem. O texto multilinha pode continuar salvo como rascunho.')
                for line in value.splitlines():directives.append('# @'+directive+' '+line+'\n')
        new='\n'+''.join(directives)+'# @note studio:v1 '+json.dumps(studio)+'\nl += ('+raw+'\n)\n\n' 
        return self._preview(path,before,(text[:offset]+new+text[offset:]).encode('utf-8'),passageId=passage_id,newPassage=True)

    def source_apply(self,params):
        preview=self.adapter.previews.get(params.get('previewId'))
        if not preview: self.error('Prévia expirada. Gere e revise uma nova diferença.','PREVIEW_NOT_FOUND')
        if params.get('sourceFingerprint')!=preview['sourceFingerprint']: self.error('A prévia não corresponde à revisão aprovada.','STALE_SOURCE')
        path=Path(preview['path'])
        if path.read_bytes()!=preview['before']: self.error('O arquivo mudou externamente. Nada foi aplicado; mantenha o rascunho e atualize.','STALE_SOURCE')
        self.fresh()
        if preview['before']==preview['after']: return self.adapter.project
        if not self.adapter.state_dir: self.error('Configure armazenamento local para manter a recuperação.','STATE_ERROR')
        recovery=self.adapter.state_dir/'recovery'; recovery.mkdir(parents=True,exist_ok=True)
        recovery_path=recovery/(preview['previewId']+'.json')
        recovery_path.write_text(json.dumps({'path':str(path),'before':preview['before'].decode('utf-8'),'afterFingerprint':digest(preview['after']),'status':'prepared'},ensure_ascii=False),encoding='utf-8')
        descriptor,temporary=tempfile.mkstemp(prefix='.'+path.name+'.studio-',dir=path.parent)
        try:
            with os.fdopen(descriptor,'wb') as handle: handle.write(preview['after']); handle.flush(); os.fsync(handle.fileno())
            if path.read_bytes()!=preview['before']: self.error('O arquivo mudou durante a gravação. Nada foi aplicado.','STALE_SOURCE')
            os.replace(temporary,path)
            directory=os.open(path.parent,os.O_RDONLY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
        self.adapter.previews.pop(preview['previewId'],None)
        return self.adapter.refresh_project()

    def source_recovery_list(self,params):
        self.require_project()
        if not self.adapter.state_dir:return {'items':[],'diagnostics':[]}
        import datetime
        items=[];diagnostics=[]
        for recovery_path in sorted((self.adapter.state_dir/'recovery').glob('*.json'),key=lambda path:path.stat().st_mtime,reverse=True):
            try:
                recovery=json.loads(recovery_path.read_text(encoding='utf-8'));path=Path(recovery['path']).resolve()
                if not path.is_relative_to(self.corpus.resolve()):continue
                current=digest(path.read_bytes()) if path.exists() else None
                items.append({'id':recovery_path.stem,'path':str(path),'createdAt':recovery.get('at') or datetime.datetime.fromtimestamp(recovery_path.stat().st_mtime,datetime.timezone.utc).isoformat(),'kind':recovery.get('kind','source-apply'),'afterFingerprint':recovery['afterFingerprint'],'currentFingerprint':current,'recoverable':current==recovery['afterFingerprint']})
            except (OSError,ValueError,KeyError,TypeError) as error:diagnostics.append(f'{recovery_path.name}: recuperação preservada mas ilegível ({error}).')
        return {'items':items,'diagnostics':diagnostics}

    def source_recover(self,params):
        if not self.adapter.state_dir: self.error('Recuperação indisponível.')
        identifier=params.get('recoveryId','')
        if not re.fullmatch(r'[a-f0-9-]{36}',identifier): self.error('Identificador de recuperação inválido.')
        recovery=json.loads((self.adapter.state_dir/'recovery'/(identifier+'.json')).read_text())
        path=Path(recovery['path']).resolve()
        if not path.is_relative_to(self.corpus.resolve()): self.error('Recuperação pertence a outro projeto.')
        before=path.read_bytes()
        if digest(before)!=recovery['afterFingerprint']: self.error('O arquivo mudou desde a aplicação; recuperação exige conciliação manual.','STALE_SOURCE')
        return self._preview(path,before,recovery['before'].encode('utf-8'),recovery=True)

    def lexicon_search(self,params):
        context=self.structure_context(params); self.fresh(params)
        result=self.child({'action':'lexicon',**context,'query':str(params.get('query','')),'limit':max(1,min(100,int(params.get('limit',40))))})
        self.fresh(params)
        return result

    def structure_context(self, params):
        self.require_project()
        if params.get('projectId',self.adapter.project['id']) != self.adapter.project['id']:
            self.error('O projeto mudou. Atualize a seleção.', 'STALE_PROJECT')
        passage = next((p for p in self.adapter.project['passages'] if p['id'] == params.get('passageId')), None)
        if passage:
            if params.get('sourceId',passage['sourceId']) != passage['sourceId']:
                self.error('A passagem pertence a outra fonte. Atualize a seleção.', 'PASSAGE_NOT_FOUND')
            return {'sourceId': passage['sourceId'], 'line': passage['sourceLine']}
        pending_id=params.get('passageId')
        if pending_id:
            try:
                if not isinstance(pending_id,str) or not pending_id.startswith('pending:') or str(uuid.UUID(pending_id[8:]))!=pending_id[8:]:
                    raise ValueError('Identidade não canônica')
            except (ValueError,AttributeError):
                self.error('Passagem não encontrada; atualize o projeto.', 'PASSAGE_NOT_FOUND')
        source = params.get('sourceId')
        if source is None and not params.get('passageId'):
            source = self.adapter.project['passages'][0]['sourceId']
        if source not in {p['sourceId'] for p in self.adapter.project['passages']}:
            self.error('Fonte da nova passagem não encontrada; atualize o projeto.', 'PASSAGE_NOT_FOUND')
        # Match the source publication point, excluding definitions that occur
        # after the final collection alias. Unsaved passages use this namespace
        # for evaluation, lexical search and constructor creation alike.
        path=self.corpus/'historic'/f'{source}.tu.py'
        anchor=next((statement for statement in ast.parse(path.read_text(encoding='utf-8')).body
                     if isinstance(statement,ast.Assign) and isinstance(statement.value,ast.Name)
                     and statement.value.id=='l' and any(isinstance(target,ast.Name) and target.id==source for target in statement.targets)),None)
        return {'sourceId': source, 'line': anchor.lineno if anchor else 10**9}

    def structure_index(self, params):
        from rendered_structures import VERSION, fingerprint, valid_index
        engine = self.fresh(params)
        project = self.adapter.project
        if params.get('projectId', project['id']) != project['id']:
            self.error('O projeto mudou. Pesquise novamente.', 'STALE_PROJECT')
        passages = {p['id']: p for p in project['passages']}
        drafts = params.get('drafts', [])
        if not isinstance(drafts, list) or len(drafts) > 1000:
            self.error('Lista de rascunhos inválida.')
        normalized = []
        for draft in drafts:
            if not isinstance(draft, dict) or not isinstance(draft.get('passageId'), str) or not isinstance(draft.get('raw'), str) or len(draft['raw']) > 100000:
                self.error('Rascunho inválido para a busca.')
            if not draft['raw'].strip():
                continue
            context = self.structure_context(draft)
            fragment_id = draft.get('fragmentId')
            if fragment_id is not None and (not isinstance(fragment_id, str) or not fragment_id or len(fragment_id) > 200):
                self.error('Identidade de peça solta inválida.')
            passage = passages.get(draft['passageId'])
            if passage and not fragment_id and draft['raw'] == passage['sourceExpression']:
                continue
            normalized.append({'passageId': draft['passageId'], 'raw': draft['raw'], **context,
                               **({'fragmentId': fragment_id} if fragment_id else {}),
                               **({'ordinal': passage['ordinal']} if passage else {})})
        normalized.sort(key=lambda value: (value['passageId'], value.get('fragmentId', ''), value['raw']))
        base_key = fingerprint({'version': VERSION, 'engine': engine, 'project': project['id']})
        draft_key = fingerprint(normalized)
        cache = getattr(self.adapter, 'structure_cache', None)
        if not cache or cache.get('baseKey') != base_key:
            base = None
            cache_path = self.adapter.state_dir / 'structure-index' / (project['id'] + '.json') if self.adapter.state_dir else None
            if cache_path and cache_path.exists():
                try:
                    stored = json.loads(cache_path.read_text(encoding='utf-8'))
                    if isinstance(stored, dict) and stored.get('baseKey') == base_key and valid_index(stored.get('base')):
                        base = stored['base']
                except (OSError, ValueError, TypeError):
                    pass
            if base is None:
                base = self.child({'action': 'structure_index', 'passages': [{'id': p['id'], 'sourceId': p['sourceId'], 'ordinal': p['ordinal']} for p in project['passages']]}, timeout=45)
                self.fresh(params)
                if cache_path:
                    cache_path.parent.mkdir(parents=True, exist_ok=True)
                    temporary = None
                    try:
                        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=cache_path.parent, delete=False) as handle:
                            temporary = handle.name
                            json.dump({'baseKey': base_key, 'base': base}, handle, ensure_ascii=False)
                        os.replace(temporary, cache_path)
                    finally:
                        if temporary and os.path.exists(temporary):
                            os.unlink(temporary)
            cache = {'baseKey': base_key, 'base': base}
            self.adapter.structure_cache = cache
        if cache.get('draftKey') != draft_key:
            changed = self.child({'action': 'structure_index', 'includeSources': False, 'drafts': normalized}, timeout=45) if normalized else {'entries': [], 'diagnostics': []}
            self.fresh(params)
            entries = {entry['id']: {**entry, 'sources': list(entry['sources'])} for entry in cache['base']['entries']}
            for entry in changed['entries']:
                if entry['id'] not in entries:
                    entries[entry['id']] = entry
                else:
                    existing = entries[entry['id']]
                    existing['sources'].extend(source for source in entry['sources'] if source not in existing['sources'])
                    existing['occurrenceCount'] = len(existing['sources'])
            cache.update({'draftKey': draft_key, 'entries': entries,
                          'diagnostics': cache['base']['diagnostics'] + changed['diagnostics'],
                          'fingerprint': fingerprint([base_key, draft_key])})
        return cache

    def structure_search(self, params):
        from rendered_structures import search
        self.structure_context(params)
        query = params.get('query', '')
        if not isinstance(query, str) or len(query) > 2000:
            self.error('Texto de busca inválido.')
        cache = self.structure_index(params)
        result = search(cache['entries'].values(), query, max(1, min(100, int(params.get('limit', 40)))))
        return {**result, 'indexFingerprint': cache['fingerprint'], 'diagnostics': cache['diagnostics']}

    def structure_resolve(self, params):
        context = self.structure_context(params)
        cache = self.structure_index(params)
        if params.get('indexFingerprint') != cache['fingerprint']:
            self.error('As estruturas ou os rascunhos mudaram. Pesquise novamente antes de inserir.', 'STALE_STRUCTURE_INDEX')
        candidate = cache['entries'].get(params.get('candidateId'))
        if candidate is None:
            self.error('Estrutura não encontrada. Pesquise novamente.', 'STRUCTURE_NOT_FOUND')
        result = self.child({'action': 'structure_resolve', 'candidate': candidate, **context})
        self.fresh(params)
        return result

    def lexicon_inspect(self,params):
        context=self.structure_context(params); self.fresh(params)
        result=self.child({'action':'lexicon_inspect',**context,'name':params.get('name')})
        self.fresh(params)
        return result

    def lexicon_create(self,params):
        self.fresh(); headword=params.get('headword',''); definition=params.get('definition',''); category=params.get('category','Noun'); scope=params.get('scope','source')
        if not isinstance(headword,str) or not headword.strip() or not isinstance(definition,str): self.error('Forma e definição são necessárias.')
        if category not in {'Noun','Verb','ProperNoun','Adverb','Postposition','Interjection','Number','Particle'}: self.error('Revise a classe lexical antes de criar.')
        if scope not in {'source','shared'}: self.error('Escolha escopo da fonte ou léxico compartilhado.')
        passage=self.passage(params) if params.get('passageId') else next(p for p in self.adapter.project['passages'] if p['sourceId']=='araujo_catecismo_1686')
        path=self.corpus/'historic/lexicon.tu.py' if scope=='shared' else self.source(passage)
        before=path.read_bytes(); text=before.decode('utf-8')
        identity='lexical:'+str(uuid.uuid5(uuid.NAMESPACE_URL,json.dumps({'project':self.adapter.project['id'],'headword':headword,'definition':definition,'category':category,'provenance':params.get('provenance'),'scope':scope},sort_keys=True,ensure_ascii=False)))
        slug=''.join(char for char in unicodedata.normalize('NFKD',headword) if not unicodedata.combining(char)); slug=re.sub(r'[^A-Za-z0-9_]','_',slug).strip('_').lower() or 'entrada'
        if slug[0].isdigit() or keyword.iskeyword(slug): slug='lex_'+slug
        suffix=hashlib.sha256(identity.encode()).hexdigest()[:8]; name=slug+'_'+suffix
        if re.search(r'(?m)^'+re.escape(name)+r'\s*=',text):
            if identity in text: return self._preview(path,before,before,name=name,lexicalId=identity,scope=scope,affectedUses=[],reused=True)
            self.error('Colisão de identificador lexical '+name+'; escolha outra forma sem sobrescrever a entrada existente.','LEXICAL_COLLISION')
        note={'id':identity,'name':name,'scope':scope,'provenance':params.get('provenance')}
        definition_text='\n# @note studio-lexical:v1 '+json.dumps(note,ensure_ascii=False)+'\n'+name+' = '+category+'('+repr(headword)+', definition='+repr(definition)+')\n\n'
        tree=ast.parse(text)
        anchor=next((s for s in tree.body if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'l','__all__',passage['sourceId']} for t in s.targets)),None)
        offset=sum(map(len,text.splitlines(keepends=True)[:anchor.lineno-1])) if anchor else len(text)
        return self._preview(path,before,(text[:offset]+definition_text+text[offset:]).encode('utf-8'),name=name,lexicalId=identity,scope=scope,affectedUses=[])

    def lexicon_update(self,params):
        self.fresh(); name=params.get('name'); definition=params.get('definition'); scope=params.get('scope','occurrence')
        if not isinstance(name,str) or not name.isidentifier() or not isinstance(definition,str): self.error('Entrada e definição inválidas.')
        entry=self.lexicon_inspect(params)
        if scope=='occurrence':
            # Keep a named reference and clone its value, preserving every class,
            # argument, variant and grammatical property; only definition changes.
            raw=f"studio_define({name}, {definition!r})"
            return {'raw':raw,'scope':scope,'name':name,'lexicalId':entry['id'],'affectedUses':[]}
        if scope not in {'source','shared'}: self.error('Escopo lexical desconhecido.')
        passage=self.passage(params)
        path=self.source(passage) if scope=='source' else self.corpus/'historic/lexicon.tu.py'
        before=path.read_bytes();text=before.decode('utf-8');tree=ast.parse(text)
        if scope=='source':
            # Place override before selected construction; it does not rewrite
            # previous entries or change the imported identifier.
            selected=source_entries(path)[passage['ordinal']-1]
            offset=sum(map(len,text.splitlines(keepends=True)[:selected['statementLine']-1]))
            # Assignments cannot be inserted inside an initial list. Place the
            # source-wide override immediately before the initial list instead.
            initial=next(s for s in tree.body if isinstance(s,ast.Assign) and isinstance(s.value,(ast.List,ast.Tuple)) and any(isinstance(t,ast.Name) and t.id in {'l',passage['sourceId']} for t in s.targets))
            if selected['statementLine'] <= initial.end_lineno: offset=sum(map(len,text.splitlines(keepends=True)[:initial.lineno-1]))
            insertion=name+'.definition = '+repr(definition)+'\n'
            # Keep existing adjacent metadata attached to its expression.
            while offset>0:
                prior_end=offset-1;prior_start=text.rfind('\n',0,prior_end)+1
                if text[prior_start:prior_end].strip().startswith('# @'):offset=prior_start
                else:break
            after=(text[:offset]+insertion+text[offset:]).encode('utf-8')
        else:
            target=next((s for s in tree.body if isinstance(s,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for t in s.targets)),None)
            if target is None:self.error('A entrada é definida pelo motor; crie uma substituição nesta fonte.','LEXICAL_SCOPE')
            value=target.value;keyword_node=next((k.value for k in value.keywords if k.arg=='definition'),None) if isinstance(value,ast.Call) else None
            from studio_authoring import position
            if keyword_node:
                start=position(text,keyword_node.lineno,keyword_node.col_offset);end=position(text,keyword_node.end_lineno,keyword_node.end_col_offset)
                after=(text[:start]+repr(definition)+text[end:]).encode('utf-8')
            else:
                offset=sum(map(len,text.splitlines(keepends=True)[:target.end_lineno]));after=(text[:offset]+name+'.definition = '+repr(definition)+'\n'+text[offset:]).encode('utf-8')
        return self._preview(path,before,after,name=name,lexicalId=entry['id'],scope=scope,affectedUses=entry['affectedUses'])

    def dictionary_search(self,params):
        from navarro_search import search_dictionary
        self.require_project(); return search_dictionary(self.adapter.parent/'nhe-enga',params)

    def dictionary_lookup(self,params):
        from navarro_search import dictionary_lookup
        self.structure_context(params); fingerprint=self.fresh(params)
        try:result=dictionary_lookup(self.adapter.parent/'nhe-enga',params)
        except ValueError as error:self.error(str(error),'DICTIONARY_SELECTION')
        self.fresh(params)
        return {**result,'engineFingerprint':fingerprint}

    def dictionary_predicate(self,params):
        from navarro_search import dictionary_entry
        context=self.structure_context(params); fingerprint=self.fresh(params)
        try:entry,row=dictionary_entry(self.adapter.parent/'nhe-enga',params)
        except ValueError as error:self.error(str(error),'DICTIONARY_SELECTION')
        result=self.child({'action':'dictionary_predicate',**context,'entry':entry,
                           'entryRecord':{key:row[key] for key in ('f','o','d','i','v','t') if key in row},
                           'constructor':params.get('constructor')})
        self.fresh(params)
        # The site dataset is outside the grammar fingerprint: check its exact
        # bytes again before returning a conversion to the visible editor.
        try:dictionary_entry(self.adapter.parent/'nhe-enga',params)
        except ValueError as error:self.error(str(error),'DICTIONARY_SELECTION')
        result.pop('structure',None)
        return {**result,'revisionId':params.get('revisionId',''),'engineFingerprint':fingerprint,'origin':'engine'}

    def assistant_context(self,params):
        context=self.structure_context(params)
        passage=next((p for p in self.adapter.project['passages'] if p['id']==params.get('passageId')),None)
        pending=passage is None
        if pending:
            if not params.get('passageId'):
                self.error('Selecione uma passagem ou um rascunho para consultar o contexto.','PASSAGE_NOT_FOUND')
            prior=[p for p in self.adapter.project['passages'] if p['sourceId']==context['sourceId'] and p['sourceLine']<context['line']]
            ordinal=max((p['ordinal'] for p in prior),default=0)+1
            passage={'id':params['passageId'],'sourceId':context['sourceId'],'ordinal':ordinal,
                     'sourceLine':context['line'],'sourceExpression':'','sourceMetadata':None,
                     'title':f'Nova passagem · {ordinal}','pending':True,
                     'acceptedReference':None,'referenceProvenance':'none'}
        raw=params.get('raw',passage['sourceExpression']);diagnostics=[]
        self.fresh(params)
        if not isinstance(raw,str) or len(raw)>100000: self.error('Expressão ausente ou muito grande.')
        evaluation=None
        try:
            evaluation=self.evaluate_expression({**params,'raw':raw})
            if evaluation.get('evaluationStatus') == 'partial':
                if params.get('action') == 'translate':
                    self.error('A análise contém etapas incompletas ou com erro. Conclua a realização antes de traduzir, ou investigue o problema no motor.', 'INCOMPLETE_EVALUATION')
                if params.get('action') != 'investigate':
                    diagnostics.append({'severity': 'warning', 'message': 'A análise contém etapas incompletas; use Investigar problema no motor para consultar a evidência parcial.'})
                    evaluation = None
        except Exception as error:
            if params.get('action')=='translate': raise
            diagnostics.append({'severity':'warning','message':'A análise atual não pôde ser avaliada: '+str(error)})
        try:parsed=parse_ast(raw)
        except SyntaxError as error:
            diagnostics.append({'severity':'warning','message':'Rascunho incompleto: '+error.msg+('; ainda não há expressão publicada.' if pending else '; referências abaixo pertencem à expressão original.')})
            parsed=ast.Expression(body=ast.Constant(value=None)) if pending else parse_ast(passage['sourceExpression'])
        references=sorted({node.id for node in ast.walk(parsed) if isinstance(node,ast.Name)})
        lexicon=self.child({'action':'lexicon_context',**context,'names':references})
        self.fresh(params)
        return {'passage':passage,'sourceId':passage['sourceId'],'ordinal':passage['ordinal'],'pending':pending,'surroundingPassages':[p for p in self.adapter.project['passages'] if p['sourceId']==passage['sourceId'] and abs(p['ordinal']-passage['ordinal'])<=2],'lexicalDefinitions':lexicon['results'],'evidence':passage.get('sourceMetadata'),'repositories':self.adapter.project['repositories'],'engineFingerprint':self.adapter.project['engineFingerprint'],'raw':raw,'evaluation':evaluation,'diagnostics':diagnostics}

    def reference_verify(self,params):
        passage=self.passage(params); self.fresh()
        result=self.child({'action':'verify','sourceId':passage['sourceId']},timeout=90); self.fresh(); return result

    def passage_lexicon(self,params):
        context=self.structure_context(params); fingerprint=self.fresh(params)
        passage=next((p for p in self.adapter.project['passages'] if p['id']==params.get('passageId')),None)
        raw=params.get('raw',passage['sourceExpression'] if passage else '')
        if not isinstance(raw,str) or len(raw)>100000:self.error('Expressão inválida.')
        result=self.child({'action':'active_lexicon',**context,'raw':raw})
        self.fresh(params)
        return {**result,'revisionId':params.get('revisionId',''),'engineFingerprint':fingerprint}

    def reference_status(self,params):
        passage=self.passage(params)
        path=self.corpus/'ground_truth/records/historic'/f"{passage['sourceId']}.jsonl"
        try: records=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
        except FileNotFoundError:records=[]
        record=records[passage['ordinal']-1] if passage['ordinal']<=len(records) else None
        return {'sourceId':passage['sourceId'],'ordinal':passage['ordinal'],'record':record,
                'recordPath':str(path.relative_to(self.corpus)),'recordCount':len(records),
                'nextOrdinal':len(records)+1,'canApproveSequentially':passage['ordinal']<=len(records)+1}

    def reference_approve(self,params):
        passage=self.passage(params); self.fresh()
        if params.get('sourceFingerprint')!=passage['sourceFingerprint']: self.error('A fonte mudou desde a revisão.','STALE_SOURCE')
        rendered=self.evaluate_expression({'passageId':passage['id'],'raw':passage['sourceExpression'],'revisionId':'approval-review','engineFingerprint':self.adapter.project['engineFingerprint']})
        if rendered.get('evaluationStatus') == 'partial': self.error('A análise precisa ser realizada por completo antes de salvar como ground truth.', 'INCOMPLETE_EVALUATION')
        if not isinstance(params.get('reviewedSurface'),str) or params['reviewedSurface']!=rendered['surface']: self.error('Confirme explicitamente a superfície revisada; avaliação não concede aprovação.','REVIEW_REQUIRED')
        if not self.adapter.state_dir:self.error('Configure armazenamento de recuperação antes de aprovar.','STATE_ERROR')
        result=self.child({'action':'approve','sourceId':passage['sourceId'],'ordinal':passage['ordinal'],'sourceFileFingerprint':passage['sourceFileFingerprint'],'reviewedSurface':params['reviewedSurface'],'engineFingerprint':self.adapter.project['engineFingerprint'],'stateDir':str(self.adapter.state_dir)},timeout=90)
        return {'approval':result,'project':self.adapter.refresh_project()}

    def contribution_prepare(self,params):
        self.require_project()
        roots=['historic','ground_truth/records/historic']
        run=subprocess.run(['git','-C',str(self.corpus),'diff','--binary','HEAD','--',*roots],capture_output=True,text=True,check=True)
        patch=run.stdout
        untracked=subprocess.run(['git','-C',str(self.corpus),'ls-files','--others','--exclude-standard','-z','--',*roots],capture_output=True,text=True,check=True).stdout
        for name in untracked.split('\0'):
            if not name:continue
            addition=subprocess.run(['git','diff','--no-index','--binary','--','/dev/null',name],cwd=self.corpus,capture_output=True,text=True)
            if addition.returncode not in (0,1):self.error('Não foi possível preparar '+name,'GIT_EXPORT_ERROR')
            patch+=addition.stdout
        return {'version':1,'kind':'studio-contribution','patch':patch,'repositories':self.adapter.project['repositories'],'draft':params.get('draft'),'editorialApproval':None,'instructions':'Patch Git revisável, incluindo alterações staged, unstaged e novos arquivos da fonte. Aplique em outro clone com git apply; preparar não cria commit nem publica.'}
