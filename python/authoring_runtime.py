"""Fresh selected-engine execution; user expressions use a bounded AST interpreter.

The selected corpus/engine are trusted local projects. Their lexicon initialization
runs as normal Python. Contributor raw input cannot run imports or arbitrary calls.
"""
from __future__ import annotations
import ast
import copy
import hashlib
import inspect
import json
import operator
from pathlib import Path
import re
import sys
import traceback
from contextlib import redirect_stdout
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from studio_authoring import expression_tree, source_entries, METHODS, parse_ast, is_slot
from lexical_metadata import inherit_lexical_status, lexical_status, prepare_lexical_arguments, restore_namespace_lexical_status, verify_lexical_arguments
from semantic_context import attach_definition_context, register_declarations

BINARY = {ast.Mult: operator.mul, ast.Add: operator.add, ast.Div: operator.truediv, ast.MatMult: operator.matmul, ast.LShift: operator.lshift, ast.RShift: operator.rshift, ast.Eq: operator.eq, ast.NotEq: operator.ne}
DUNDERS = {ast.Mult: '__mul__', ast.Add: '__add__', ast.Div: '__truediv__', ast.MatMult: '__matmul__', ast.LShift: '__lshift__', ast.RShift: '__rshift__', ast.Eq: '__eq__', ast.NotEq: '__ne__', ast.UAdd: '__pos__', ast.USub: '__neg__'}
CONSTRUCTORS = {'Noun','ProperNoun','Pronoun','Verb','Adverb','Postposition','Interjection','Number','Particle','Conjunction','Demonstrative','Copula','SizeSuffix'}


def studio_define(value, definition):
    if not hasattr(value, 'eval') or not isinstance(definition, str): raise ValueError('Definição local inválida.')
    result = value.copy(); result.definition = definition; return result


def configure(parent):
    corpus = parent / 'oldtupicorpus'; engine = parent / 'nhe-enga'
    sys.path[:0] = [str(corpus), str(engine/'pydicate'), str(engine/'tupi')]
    return corpus


def namespace_for(corpus, source_path, line):
    from historic.lexicon import load_lexicon
    namespace = load_lexicon()
    shared_path = corpus/'historic/lexicon.tu.py'
    shared_statements = ast.parse(shared_path.read_text(encoding='utf-8')).body
    restore_namespace_lexical_status(namespace, shared_statements)
    register_declarations(namespace, shared_statements, shared_path)
    namespace['studio_define'] = studio_define
    namespace['__name__'] = 'historic._studio_source_context'
    # Keep source-local assignments/helpers and contextual mutations in execution
    # order. Ignore source collections and __main__; no source module is imported.
    statements = [statement for statement in ast.parse(source_path.read_text(encoding='utf-8')).body if statement.lineno < line]
    for statement in statements:
        if isinstance(statement, ast.Assign):
            if isinstance(statement.value, (ast.List, ast.Tuple)): continue
            if any(isinstance(target, ast.Name) and target.id in {'l', source_path.name.removesuffix('.tu.py')} for target in statement.targets): continue
            if isinstance(statement.value, ast.Lambda):
                # Definition is trusted source, not a contributor candidate.
                exec(compile(ast.Module(body=[statement], type_ignores=[]), str(source_path), 'exec'), namespace)
            else:
                value = interpret(statement.value, namespace)
                for target in statement.targets:
                    if isinstance(target, ast.Name): namespace[target.id] = value
                    elif isinstance(target, ast.Attribute) and target.attr == 'definition' and isinstance(target.value, ast.Name): setattr(namespace[target.value.id], 'definition', value)
                    else: raise ValueError('Contexto de atribuição requer extensão de adaptador.')
        elif isinstance(statement, ast.FunctionDef) and not statement.name.startswith('_'):
            exec(compile(ast.Module(body=[statement], type_ignores=[]), str(source_path), 'exec'), namespace)
    restore_namespace_lexical_status(namespace, statements)
    register_declarations(namespace, statements, source_path)
    return namespace


def callable_allowed(name, value):
    if name == 'studio_define' and value is studio_define: return True
    if name.startswith('_'): return False
    if name in CONSTRUCTORS or name == 'cop': return inspect.isclass(value) and value.__module__.startswith('pydicate.')
    return inspect.isfunction(value) and (value.__module__.startswith('historic.') or value.__module__.startswith('pydicate.lang.tupilang'))


def predicate_catalog(namespace):
    """Expose only constructors accepted by the contributor interpreter.

    Signatures/defaults come from the selected engine, including Pronoun's
    distinct first argument. The one numeric optional field without a Python
    annotation is Verb.vid, the engine's dictionary record identifier.
    """
    constructors=[]; diagnostics=[]
    for name in sorted(CONSTRUCTORS):
        value=namespace.get(name)
        if value is None or not callable_allowed(name,value):
            continue
        signature=inspect.signature(value)
        parameters=[]
        for parameter in signature.parameters.values():
            default=parameter.default
            if parameter.kind in {inspect.Parameter.VAR_POSITIONAL,inspect.Parameter.VAR_KEYWORD,inspect.Parameter.POSITIONAL_ONLY}:
                diagnostics.append(f'{name}: assinatura requer extensão do formulário.')
                break
            if default is not inspect.Parameter.empty and not isinstance(default,(str,int,float,bool,type(None))):
                diagnostics.append(f'{name}.{parameter.name}: valor padrão requer extensão do formulário.')
                break
            kind='boolean' if parameter.annotation is bool or type(default) is bool else 'number' if parameter.annotation in (int,float) or type(default) in (int,float) or name=='Verb' and parameter.name=='vid' else 'text'
            parameters.append({'name':parameter.name,'required':default is inspect.Parameter.empty,'kind':kind,
                               'nullable':default is None,
                               **({'default':default} if default is not inspect.Parameter.empty else {})})
        else:
            constructors.append({'name':name,'signature':str(signature),'parameters':parameters})
    return {'constructors':constructors,'diagnostics':diagnostics}


def predicate_create(payload,namespace):
    import math
    name=payload.get('constructor'); values=payload.get('values')
    catalog=next((entry for entry in predicate_catalog(namespace)['constructors'] if entry['name']==name),None)
    if catalog is None:
        raise ValueError('Tipo de predicado não disponível neste contexto.')
    if not isinstance(values,dict) or len(values)>30:
        raise ValueError('Propriedades do predicado inválidas.')
    parameters={parameter['name']:parameter for parameter in catalog['parameters']}
    if any(key not in parameters for key in values):
        raise ValueError('A propriedade não pertence à assinatura deste predicado.')
    for key,value in values.items():
        parameter=parameters[key]
        if value is None and parameter['nullable']:
            continue
        valid=(isinstance(value,str) and len(value)<=10000 if parameter['kind']=='text' else
               type(value) is bool if parameter['kind']=='boolean' else
               type(value) in (int,float) and math.isfinite(value))
        if not valid:
            raise ValueError(f'{key}: valor incompatível com o tipo de propriedade.')
    inspect.signature(namespace[name]).bind(**values)
    values, definition_override, lexical = prepare_lexical_arguments(name, values, payload.get('lexical'), namespace[name])
    inspect.signature(namespace[name]).bind(**values)
    syntax=ast.Call(func=ast.Name(id=name,ctx=ast.Load()),args=[],
                    keywords=[ast.keyword(arg=key,value=ast.Constant(value=values[key])) for key in parameters if key in values])
    if definition_override is not None:
        syntax=ast.Call(func=ast.Name(id='studio_define',ctx=ast.Load()),args=[syntax,ast.Constant(value=definition_override)],keywords=[])
    raw=ast.unparse(ast.fix_missing_locations(syntax))
    value=interpret(syntax,namespace)
    verify_lexical_arguments(value,name,lexical)
    status=lexical_status(value)
    return {'expression':raw,**({'lexicalStatus':status} if status else {}),**realize(raw,namespace)}


def dictionary_predicate(payload,namespace):
    """Convert one verified site row, preserving its exact lexical sense.

    Verb's constructor may otherwise choose a homograph by spelling. Pin only
    an engine row whose form, sense, definition and class all match the click.
    """
    from navarro_search import dictionary_constructor_hints, size_suffix_hint
    entry=payload['entry'];row=payload['entryRecord'];diagnostics=[]
    catalog=predicate_catalog(namespace)['constructors']
    available=[item['name'] for item in catalog
               if any(parameter['name'] in {'value','inflection_or_verbete'} for parameter in item['parameters'])]
    hints,_=dictionary_constructor_hints(entry['definition'])
    size_hint=size_suffix_hint(entry['headword'],entry['definition'])
    if size_hint: hints=[*dict.fromkeys([*hints, size_hint])] if entry['headword']=='mirĩ' else [size_hint]
    suggested=hints[0] if len(hints)==1 and hints[0] in available else None
    response={'entry':entry,'constructors':available,'diagnostics':diagnostics,
              **({'suggestedConstructor':suggested} if suggested else {})}
    if row.get('t') not in (1,True):
        return {**response,'status':'unavailable','diagnostics':['Esta linha não é um verbete tupi–português. Escolha a entrada tupi correspondente.']}
    selected=payload.get('constructor')
    if selected is None:
        if suggested is None:
            return {**response,'status':'needs-choice','diagnostics':['O cabeçalho não determina um único tipo de predicado. Escolha como representar este verbete.']}
        selected=suggested
    if not isinstance(selected,str) or selected not in available:
        raise ValueError('Escolha um construtor lexical disponível no motor selecionado.')
    if selected == 'SizeSuffix' and not size_hint:
        raise ValueError('Esta acepção não é um aumentativo ou diminutivo identificado.')
    if namespace[selected].__name__!=selected:
        return {**response,'status':'unavailable','diagnostics':['Este nome de construtor foi substituído no contexto da fonte. Revise a definição antes de inserir.']}
    values={'inflection_or_verbete' if selected=='Pronoun' else 'value':entry['headword'],
            'definition':entry['definition']}
    if selected=='Verb':
        module=inspect.getmodule(namespace[selected])
        candidates=[candidate for candidate in getattr(module,'dict_conjugated',[])
                    if all(candidate.get(key,'')==row.get(key,'') for key in ('f','o','d','v'))
                    and type(candidate.get('i')) is int and candidate['i']>0]
        identities={candidate['i'] for candidate in candidates}
        if len(identities)!=1:
            return {**response,'status':'unavailable','diagnostics':['Esta acepção não corresponde de modo único aos dados verbais do motor. A palavra não foi substituída por um homônimo.']}
        engine_id=next(iter(identities))
        actual=getattr(module,'_DICT_BY_ID',{}).get(engine_id)
        if actual is None or not all(actual.get(key,'')==row.get(key,'') for key in ('f','o','d','v')):
            return {**response,'status':'unavailable','diagnostics':['O identificador verbal selecionado aponta para outra acepção no motor. Atualize o dicionário antes de inserir.']}
        values.update(vid=engine_id,verb_class=actual.get('v',''))
        response['engineDictionaryVid']=engine_id
    result=predicate_create({'constructor':selected,'values':values},namespace)
    if selected=='ProperNoun':
        # ProperNoun currently ignores its definition argument. Make the copied
        # occurrence's full dictionary definition explicit in portable source.
        raw=f"studio_define({result['expression']}, {entry['definition']!r})"
        result={'expression':raw,**realize(raw,namespace)}
    diagnostics.extend(item if isinstance(item,str) else item.get('message',str(item)) for item in result.get('diagnostics',[]))
    return {**result,**response,'status':'ready','constructor':selected,'diagnostics':diagnostics}


def shape(value, depth=0, active=None, path='$'):
    """Runtime graph including principal links, excluding volatile generated IDs."""
    if value is None or isinstance(value, (str, int, float, bool)): return value
    active = {} if active is None else active
    if id(value) in active: return {'reference': active[id(value)]}
    if depth > 40: return {'type': type(value).__name__, 'truncated': True}
    active = {**active, id(value): path}
    if isinstance(value, (list,tuple)): return [shape(v,depth+1,active,path+'/'+str(index)) for index,v in enumerate(value)]
    if isinstance(value, dict): return {str(k):shape(v,depth+1,active,path+'/'+str(k)) for k,v in sorted(value.items(),key=lambda x:str(x[0])) if not str(k).startswith('__')}
    if callable(value): return {'callable': getattr(value,'__qualname__',type(value).__name__)}
    if not hasattr(value, '__dict__'): return {'type': type(value).__name__}
    ignored = {'nid', '_var_name', 'fname', 'ped_label', 'functional_gloss', 'gloss', 'history', 'modifiers', '_trackable_id'}
    return {'type': type(value).__module__+'.'+type(value).__name__, **{k:shape(v,depth+1,active,path+'/'+k) for k,v in sorted(vars(value).items()) if k not in ignored and not k.startswith(('__', '_studio_'))}}


def runtime_summary(value):
    result = {'runtimeType':type(value).__name__, 'category':getattr(value,'category',type(value).__name__)}
    status = lexical_status(value)
    if status: result['lexicalStatus'] = status
    for key in ('definition','verbete','tag','mood','negated','variation_id','reduplicated','circumstancial','_inflection'):
        val = getattr(value,key,None)
        if isinstance(val,(str,int,float,bool)) or val is None: result[key.lstrip('_')] = val
    for key in ('arguments','pre_adjuncts','post_adjuncts','v_adjuncts','v_adjuncts_pre','compositions'):
        values = getattr(value,key,None)
        if isinstance(values,list): result[key] = [{'runtimeType':type(v).__name__, 'category':getattr(v,'category',None),'tag':getattr(v,'tag',None),'verbete':getattr(v,'verbete',None)} for v in values]
    if getattr(value, 'category', '') == 'verb' and hasattr(value, 'object'):
        roles = []
        for role, method in [('subject', value.subject), ('object', value.object)]:
            argument = method()
            if argument is not None:
                roles.append({'role': role, 'argumentIndex': next((index for index, arg in enumerate(value.arguments) if arg is argument), None), 'verbete': getattr(argument, 'verbete', ''), 'inflection': argument.inflection(), 'expressed': not getattr(argument, 'pro_drop', False), 'evidence': type(value).__module__ + '.' + type(value).__name__ + '.' + role + '()'})
            elif role == 'subject' and value.arguments and value.verb.transitivo:
                roles.append({'role': 'subject', 'argumentIndex': None, 'inflection': '3p', 'expressed': False, 'inferredByEngine': True, 'evidence': 'Verb.preval(): one argument on a transitive verb gives a third-person subject'})
        result['engineRoles'] = roles
    return result


def runtime_graph(value, limit=1200, source_nodes=None):
    """An identity-preserving view of the actual selected-engine predicate graph.

    Interpreter provenance is an immutable tag carried by the engine's copy
    operation. It identifies evaluated source scopes, never guesses by labels.
    Backlinks and morphology copies remain separate real object identities.
    """
    labels = {
        'arguments': 'argumento', 'compositions': 'composição',
        'pre_adjuncts': 'adjunto anterior', 'post_adjuncts': 'adjunto posterior',
        'v_adjuncts_pre': 'adjunto verbal anterior', 'v_adjuncts': 'adjunto verbal posterior',
        '_augmentee': 'base da derivação', '_augmentor': 'derivador',
        'principal': 'oração principal', '_subject': 'sujeito armazenado',
        '_arguments': 'argumento da base',
        'arg0': 'cópia para realização',
    }
    preferred = list(labels)
    ignored = {'history', 'modifiers', 'gloss', 'functional_gloss', 'nid', '_trackable_id', '_var_name', 'fname', 'ped_label'}
    identifiers = {id(value): 'runtime:0'}
    pending = [value]
    nodes = []; edges = []; diagnostics = []
    def predicate(candidate):
        return hasattr(candidate, 'eval') and hasattr(candidate, 'category') and not inspect.isclass(candidate)
    def primitives(candidate):
        return {key: item for key, item in vars(candidate).items()
                if key not in ignored and not key.startswith(('__', '_studio_'))
                and isinstance(item, (str, int, float, bool, type(None)))} if hasattr(candidate, '__dict__') else {}
    for current in pending:
        identifier = identifiers[id(current)]
        attributes = primitives(current)
        # Composition can store annotated stems in verbete. Keep that exact
        # evidence in attributes, but use the visible stem in tree titles.
        stem = str(getattr(current, 'verbete', '') or '')
        label = re.sub(r'\[[^\[\]]*\]', '', stem).strip() or type(current).__name__
        node = {'id': identifier, 'label': label,
                'runtimeType': type(current).__name__, 'category': str(getattr(current, 'category', '')),
                'definition': str(getattr(current, 'definition', '') or ''), 'tag': str(getattr(current, 'tag', '') or ''),
                'attributes': attributes, 'morphology': {}}
        node['methods'] = sorted(name for name in METHODS if callable(getattr(current, name, None)))
        occurrences = [source_nodes[source_id] for source_id in getattr(current, '_studio_sources', ())
                       if source_nodes and source_id in source_nodes]
        if occurrences:
            node['sourceOccurrences'] = sorted(occurrences, key=lambda item: -(item['end'] - item['start']))
            node['sourceNodeId'] = node['sourceOccurrences'][0]['sourceNodeId']
            node['lexicalOrigins'] = sorted({item['code'] for item in occurrences if item['kind'] == 'reference'})
        if current is value: node['sourceNodeId'] = 'root'
        # Embedded morphology is evidence from the engine object, not a second
        # application of a construction or a guessed segmentation of its form.
        for field in ('noun', 'verb', 'noun_morphology'):
            # A property such as Postposition.noun invokes eval() and constructs
            # fresh morphology; inspect stored evidence without evaluating again.
            embedded = vars(current).get(field)
            if embedded is not None:
                node['morphology'].update({field + '.' + key: item for key, item in primitives(embedded).items()})
        role_objects = {}
        if getattr(current, 'category', None) == 'verb':
            for role in ('subject', 'object'):
                method = getattr(current, role, None)
                if callable(method):
                    try:
                        argument = method()
                        if predicate(argument): role_objects.setdefault(id(argument), []).append(role)
                    except (AttributeError, IndexError, TypeError, ValueError) as error:
                        diagnostics.append(f'{identifier}: {role}() indisponível: {error}')
            try: node['engineRoles'] = runtime_summary(current).get('engineRoles', [])
            except (AttributeError, IndexError, TypeError, ValueError): pass
        nodes.append(node)
        fields = preferred + sorted(key for key in set(vars(current)) - set(preferred) - ignored if not key.startswith('_studio_'))
        for field in fields:
            child_value = getattr(current, field, None)
            candidates = list(enumerate(child_value)) if isinstance(child_value, (list, tuple)) else [(None, child_value)]
            for index, child in candidates:
                if not predicate(child): continue
                existing = id(child) in identifiers
                if not existing:
                    if len(identifiers) >= limit:
                        message = f'Árvore limitada a {limit} nós; relações adicionais não foram carregadas.'
                        if message not in diagnostics: diagnostics.append(message)
                        continue
                    identifiers[id(child)] = 'runtime:' + str(len(identifiers)); pending.append(child)
                label = labels.get(field, field)
                evidence = type(current).__module__ + '.' + type(current).__name__ + '.' + field
                if field == 'arguments' and id(child) in role_objects:
                    roles = role_objects[id(child)]
                    label = ' / '.join({'subject': 'sujeito', 'object': 'objeto'}[role] for role in roles)
                    evidence = ' + '.join(type(current).__name__ + '.' + role + '()' for role in roles)
                elif index is not None: label += ' ' + str(index + 1)
                edges.append({'id': 'edge:' + str(len(edges)), 'source': identifier, 'target': identifiers[id(child)],
                              'field': field, 'index': index, 'label': label,
                              'kind': 'internal' if field == 'arg0' else 'reference' if existing or field in ('principal', '_subject') else 'child', 'evidence': evidence})
    return {'version': 1, 'rootId': identifiers[id(value)], 'nodes': nodes, 'edges': edges, 'diagnostics': diagnostics}


def evaluation_snapshot(value, memo=None):
    """Copy all stored step state, including fields the engine's copy shares.

    Predicate.__deepcopy__ intentionally shares some caches and internal objects.
    A preview must not share any mutable instance state with the live expression,
    or evaluating it could change a later step's result. Uncopyable values simply
    make this one preview unavailable; the ordinary realization still succeeds.
    """
    if value is None or isinstance(value, (str, bytes, int, float, bool, complex)) or inspect.isroutine(value) or inspect.isclass(value):
        return value
    memo = {} if memo is None else memo
    if id(value) in memo: return memo[id(value)]
    if type(value) is list:
        result = []; memo[id(value)] = result
        result.extend(evaluation_snapshot(item, memo) for item in value)
    elif type(value) is dict:
        result = {}; memo[id(value)] = result
        result.update((evaluation_snapshot(key, memo), evaluation_snapshot(item, memo)) for key, item in value.items())
    elif type(value) is set:
        result = set(); memo[id(value)] = result
        result.update(evaluation_snapshot(item, memo) for item in value)
    elif type(value) is tuple:
        result = tuple(evaluation_snapshot(item, memo) for item in value)
        memo[id(value)] = result
    elif hasattr(value, '__dict__'):
        # Bypass selective engine copy methods, without invoking constructors or
        # properties. Engine predicates and embedded morphology store state here.
        if any(base.__dict__.get('__slots__') for base in type(value).__mro__):
            raise TypeError('Estado com slots não pode ser isolado para esta prévia.')
        result = object.__new__(type(value)); memo[id(value)] = result
        vars(result).update((key, evaluation_snapshot(item, memo)) for key, item in vars(value).items())
    else:
        result = copy.deepcopy(value, memo)
        if result is value:
            raise TypeError('Estado interno não pode ser isolado para esta prévia.')
    return result


def capture_evaluation(value):
    if isinstance(value, (str, int, float, bool, type(None))):
        return {'status': 'value', 'value': value if isinstance(value, str) else repr(value)}
    if inspect.isclass(value) or not callable(getattr(value, 'eval', None)):
        return {'status': 'unavailable', 'message': 'Este valor não possui realização Pydicate.'}
    try:
        return {'snapshot': evaluation_snapshot(value)}
    except Exception as error:
        return {'status': 'unavailable', 'message': 'Não foi possível isolar esta etapa: ' + str(error)[:240]}


def finish_evaluation(captured):
    if 'snapshot' not in captured: return captured
    try:
        return {'status': 'ok', 'surface': str(captured['snapshot'].eval())}
    except Exception as error:
        return {'status': 'unavailable', 'message': 'Esta etapa isolada não pôde ser realizada: ' + str(error)[:240]}


def interpret(node, namespace, cards=None, identifier='root', evaluations=None):
    if isinstance(node, ast.Name):
        if node.id.startswith('_') or node.id not in namespace: raise ValueError(f'Referência lexical desconhecida: {node.id}')
        value = namespace[node.id]
        if not (hasattr(value,'eval') or callable_allowed(node.id,value) or isinstance(value,(str,int,float,bool))): raise ValueError(f'Referência {node.id} não é uma entrada lexical.')
        # Isolate source occurrences so two references to the same namespace
        # value never overwrite each other's provenance. Pydicate's own copy
        # retains its object graph and immutable studio tags through operations.
        if cards is not None and hasattr(value, 'eval') and not inspect.isclass(value):
            value = value.copy()
    elif isinstance(node, ast.Constant) and isinstance(node.value,(str,int,float,bool,type(None))): value=node.value
    elif isinstance(node, ast.BinOp) and type(node.op) in BINARY:
        left=interpret(node.left,namespace,cards,identifier+'/left',evaluations); right=interpret(node.right,namespace,cards,identifier+'/right',evaluations)
        if not hasattr(left,'eval') or not hasattr(right,'eval'): raise ValueError('Operadores de construção requerem operandos Pydicate.')
        value=inherit_lexical_status(BINARY[type(node.op)](left,right),left,right)
        if cards is not None:
            implementation=getattr(type(left),DUNDERS[type(node.op)])
            cards[identifier]={'dispatch':f'{implementation.__module__}.{implementation.__qualname__}', 'operandTypes':[type(left).__name__,type(right).__name__]}
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)):
        operand=interpret(node.operand,namespace,cards,identifier+'/operand',evaluations)
        if not hasattr(operand,'eval'): raise ValueError('Operador de escopo requer um predicado.')
        value=inherit_lexical_status(operator.pos(operand) if isinstance(node.op,ast.UAdd) else operator.neg(operand),operand)
        if cards is not None:
            implementation=getattr(type(operand),DUNDERS[type(node.op)])
            cards[identifier]={'dispatch':f'{implementation.__module__}.{implementation.__qualname__}', 'operandTypes':[type(operand).__name__]}
    elif isinstance(node, ast.Compare) and len(node.ops)==1 and type(node.ops[0]) in BINARY:
        left=interpret(node.left,namespace,cards,identifier+'/left',evaluations); right=interpret(node.comparators[0],namespace,cards,identifier+'/right',evaluations)
        if not hasattr(left,'eval') or not hasattr(right,'eval'): raise ValueError('Relação requer predicados Pydicate.')
        value=inherit_lexical_status(BINARY[type(node.ops[0])](left,right),left,right)
        if cards is not None:
            implementation=getattr(type(left),DUNDERS[type(node.ops[0])]); cards[identifier]={'dispatch':f'{implementation.__module__}.{implementation.__qualname__}', 'operandTypes':[type(left).__name__,type(right).__name__]}
    elif isinstance(node, ast.Call) and isinstance(node.func,(ast.Name,ast.Attribute)):
        receiver=None
        if isinstance(node.func, ast.Name):
            name=node.func.id; function=namespace.get(name)
            if not callable_allowed(name,function): raise ValueError(f'Chamada {name} não é helper ou construtor lexical permitido.')
        else:
            name=node.func.attr
            if name not in METHODS: raise ValueError(f'Método {name} requer uma extensão de adaptador.')
            receiver=interpret(node.func.value,namespace,cards,identifier+'/receiver',evaluations)
            if not hasattr(receiver,'eval'): raise ValueError('Método requer um predicado.')
            function=getattr(receiver,name)
        args=[interpret(arg,namespace,cards,identifier+'/arg'+str(index),evaluations) for index,arg in enumerate(node.args)]
        kwargs={}
        for keyword in node.keywords:
            if keyword.arg is None or keyword.arg.startswith('_'): raise ValueError('Expansão ou argumento privado não permitido.')
            kwargs[keyword.arg]=interpret(keyword.value,namespace,cards,identifier+'/kw:'+keyword.arg,evaluations)
        value=inherit_lexical_status(function(*args,**kwargs),function,receiver,*args,*kwargs.values())
        if cards is not None: cards[identifier]={'dispatch':f'{function.__module__}.{function.__qualname__}'}
    else: raise ValueError(f'{type(node).__name__}: construção preservada, extensão necessária para execução.')
    if cards is not None:
        cards.setdefault(identifier,{}).update(runtime_summary(value))
        if hasattr(value, 'eval') and not inspect.isclass(value):
            value._studio_sources = tuple(dict.fromkeys((*getattr(value, '_studio_sources', ()), identifier)))
    if evaluations is not None and identifier != 'root':
        # Capture before an ancestor operation can mutate or freeze this value.
        # Do not evaluate here: building the canonical result always comes first.
        evaluations[identifier] = capture_evaluation(value)
    return value


def _realize_complete(raw, namespace):
    parsed=expression_tree(raw)
    if not parsed['capabilities']['edit']: raise ValueError('Expressão inválida ou construção ainda não executável.')
    cards={}; evaluations={}; value=interpret(parse_ast(raw),namespace,cards,evaluations=evaluations)
    if not hasattr(value,'eval'): raise ValueError('A expressão resulta em um valor sem realização Pydicate.')
    # Snapshot before eval, which may initialize engine caches.
    structure=shape(value)
    surface=str(value.eval()); annotated=str(value.eval(annotated=True))
    morphemes=[{'text':text.strip(),'tag':tag,'nodeId':'root','explanation':'Anotação retornada pela gramática selecionada; o alinhamento a constituintes internos não é inferido.'} for text,tag in re.findall(r'([^\[\]]+)\[([^\[\]]+)\]',annotated)]
    source_nodes = {}
    def sources(node):
        source_nodes[node['id']] = {'sourceNodeId':node['id'], 'code':node['code'], 'kind':node['kind'], 'start':node['start'], 'end':node['end']}
        for child in node['children']: sources(child['node'])
    sources(parsed['root'])
    graph = runtime_graph(value,source_nodes=source_nodes)
    def attach(node):
        node.update(cards.get(node['id'],{}))
        node['evaluation'] = {'status': 'ok', 'surface': surface} if node['id'] == 'root' else finish_evaluation(evaluations[node['id']])
        if node.get('runtimeType') and node['kind'] in ('binary','comparison','unary'):
            node['label']=f"{node['operator']} · {node['runtimeType']}"
        for child in node['children']: attach(child['node'])
    attach(parsed['root'])
    return {'surface':surface,'annotated':annotated,'morphemes':morphemes,'tree':parsed['root'],'runtimeTree':graph,'structure':structure,'structureFingerprint':'sha256:'+hashlib.sha256(json.dumps(structure,sort_keys=True,ensure_ascii=False).encode()).hexdigest(),'diagnostics':parsed['diagnostics'],'evaluationStatus':'complete','failures':[]}


def _partial_realization(raw, namespace, original_error):
    """Evaluate a supported source tree once, retaining independent branches.

    A constructed predicate can fail eval in isolation and still be a valid
    input to its parent. Only failure to *construct* a value blocks an ancestor.
    Step snapshots are evaluated after the entire construction pass, so preview
    caches never influence sibling operations or contextual recovery.
    """
    parsed = expression_tree(raw)
    missing = object()
    captures = {}
    failures = []

    def fail(node, status, stage, message, causes=None, error=None):
        evidence = {'status': status, 'message': message}
        if causes:
            evidence['causes'] = causes
        node['evaluation'] = evidence
        failure = {'nodeId': node['id'], 'expression': node['code'], 'message': message, 'stage': stage}
        if causes:
            failure['blockedBy'] = causes
        if error is not None:
            frames = [{'file': frame.filename, 'line': frame.lineno, 'function': frame.name, 'source': frame.line}
                      for frame in traceback.extract_tb(error.__traceback__)
                      if '/pydicate/' in frame.filename or '/tupi/' in frame.filename][-6:]
            if frames:
                failure['engineFrames'] = frames
        failures.append(failure)
        return missing

    def visit(node):
        children = {child['slot']: visit(child['node']) for child in node['children']}
        blocked = [child['node'] for child in node['children'] if children[child['slot']] is missing]
        if node['kind'] == 'hole':
            return fail(node, 'missing', 'missing', 'Conecte uma palavra ou construção a este lugar.')
        if blocked:
            causes = list(dict.fromkeys(cause for child in blocked for cause in child['evaluation'].get('causes', [child['id']])))
            return fail(node, 'blocked', 'operation', 'Esta etapa aguarda as partes indicadas.', causes)
        syntax = parse_ast(node['code'])
        local = dict(namespace)
        # The child values are already constructed. Substitute references only
        # into this one operation, without rerunning their subexpressions.
        def argument(slot):
            value = children[slot]
            if value is None:
                return ast.Constant(value=None)
            name = 'studio_partial_value_' + str(len(local))
            while name in local:
                name += '_'
            local[name] = value
            return ast.Name(id=name, ctx=ast.Load())
        if isinstance(syntax, ast.BinOp):
            syntax.left, syntax.right = argument('left'), argument('right')
        elif isinstance(syntax, ast.Compare):
            syntax.left, syntax.comparators = argument('left'), [argument('right')]
        elif isinstance(syntax, ast.UnaryOp):
            syntax.operand = argument('operand')
        elif isinstance(syntax, ast.Call):
            if isinstance(syntax.func, ast.Attribute):
                syntax.func.value = argument('receiver')
            syntax.args = [argument('arg' + str(index)) for index in range(len(syntax.args))]
            syntax.keywords = [ast.keyword(arg=keyword.arg, value=argument('kw:' + keyword.arg)) for keyword in syntax.keywords]
        try:
            if isinstance(syntax, (ast.BinOp, ast.Compare, ast.UnaryOp)):
                original = parse_ast(node['code'])
                operand = children['operand'] if isinstance(original, ast.UnaryOp) else children['left']
                operation = original.ops[0] if isinstance(original, ast.Compare) else original.op
                node['operandTypes'] = [type(children[key]).__name__ for key in ('operand',) if key in children] or [type(children[key]).__name__ for key in ('left', 'right')]
                method = getattr(type(operand), DUNDERS[type(operation)])
                node['dispatch'] = f'{method.__module__}.{method.__qualname__}'
            elif isinstance(syntax, ast.Call):
                node['operandTypes'] = [type(value).__name__ for value in children.values()]
                function = getattr(children['receiver'], syntax.func.attr) if isinstance(syntax.func, ast.Attribute) else namespace[syntax.func.id]
                node['dispatch'] = f'{function.__module__}.{function.__qualname__}'
        except (AttributeError, KeyError, TypeError):
            pass
        try:
            # Named occurrences use the canonical engine copy path. An operation
            # receives its actual child values without another implicit copy.
            value = interpret(syntax, local, {} if not children else None)
        except Exception as error:
            return fail(node, 'error', 'reference' if node['kind'] == 'reference' else 'operation', f'{type(error).__name__}: {error}'[:1200], error=error)
        try:
            node.update(runtime_summary(value))
        except Exception:
            node.update(runtimeType=type(value).__name__, category=getattr(value, 'category', type(value).__name__))
        captures[node['id']] = capture_evaluation(value)
        return value

    visit(parsed['root'])

    def finish(node):
        if node['id'] in captures:
            captured = captures[node['id']]
            if 'snapshot' in captured:
                try:
                    node['evaluation'] = {'status': 'ok', 'surface': str(captured['snapshot'].eval())}
                except Exception as error:
                    fail(node, 'error', 'evaluation', f'{type(error).__name__}: {error}'[:1200], error=error)
            else:
                node['evaluation'] = captured
        for child in node['children']:
            finish(child['node'])

    finish(parsed['root'])
    if not failures:
        # A canonical annotation/graph failure still needs explicit evidence even
        # if isolated surface previews succeed. Never claim a complete result.
        fail(parsed['root'], 'error', 'evaluation', f'{type(original_error).__name__}: {original_error}'[:1200], error=original_error)
    return {'evaluationStatus': 'partial', 'surface': '', 'annotated': '', 'morphemes': [],
            'tree': parsed['root'], 'failures': failures,
            'diagnostics': [*parsed['diagnostics'], *[{'severity': 'error' if not failure.get('blockedBy') else 'warning', **failure} for failure in failures]]}


def realize(raw, namespace):
    parsed = expression_tree(raw)
    if not parsed['capabilities']['edit']:
        raise ValueError('Expressão inválida ou construção ainda não executável.')
    syntax = parse_ast(raw)
    for node in ast.walk(syntax):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not callable_allowed(node.func.id, namespace.get(node.func.id)):
            raise ValueError(f'Chamada {node.func.id} não é helper ou construtor lexical permitido.')
        if isinstance(node, ast.Name) and node.id.startswith('_') and not is_slot(node.id):
            raise ValueError('Referências privadas não são permitidas.')
    # Keep a fresh fallback before canonical execution can initialize caches.
    from rendered_structures import isolated_namespace
    try:
        fallback = isolated_namespace(namespace, syntax)
    except Exception:
        fallback = None
    try:
        result = _realize_complete(raw, namespace)
    except Exception as error:
        if fallback is None:
            raise
        result = _partial_realization(raw, fallback, error)
    try:
        result['definitionContext'] = attach_definition_context(result['tree'], namespace, result.get('runtimeTree'))
    except Exception as error:
        # Semantic provenance is supplemental evidence. A missing declaration
        # must never turn a successful morphological realization into a failure.
        result['definitionContext'] = {'version': 1, 'root': None, 'truncated': True,
                                       'diagnostics': ['O contexto de significados não pôde ser preparado: ' + type(error).__name__]}
    return result


def lexical_entries(corpus, source_path, namespace, source_line=None):
    import unicodedata
    declarations = {}
    for path in [corpus / 'historic/lexicon.tu.py', source_path]:
        text = path.read_text(encoding='utf-8')
        for statement in ast.parse(text).body:
            if path==source_path and source_line and statement.lineno>=source_line:
                break
            if isinstance(statement, ast.Assign):
                for target in statement.targets:
                    if isinstance(target, ast.Name) and target.id in namespace:
                        node = statement.value
                        declarations[target.id] = {'expression': ast.get_source_segment(text,node), 'line':statement.lineno, 'sourcePath':str(path), 'kind':'helper' if isinstance(node,ast.Lambda) else 'alias' if isinstance(node,ast.Name) else 'word' if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in CONSTRUCTORS else 'compound'}
            elif isinstance(statement,ast.FunctionDef) and statement.name in namespace:
                declarations[statement.name]={'expression':ast.get_source_segment(text,statement),'line':statement.lineno,'sourcePath':str(path),'kind':'helper'}
    uses={}
    for entry in source_entries(source_path):
        for name in {node.id for node in ast.walk(parse_ast(entry['expression'])) if isinstance(node,ast.Name)}:
            uses.setdefault(name,[]).append(entry['ordinal'])
    identities = {}
    for lexical_path in [corpus / 'historic/lexicon.tu.py', source_path]:
        text=lexical_path.read_text(encoding='utf-8')
        if lexical_path==source_path and source_line:
            text=''.join(text.splitlines(keepends=True)[:source_line-1])
        for match in re.finditer(r'(?m)^\s*#\s*@note\s+studio-lexical:v1\s+(\{[^\n]*\})', text):
            try:
                identity = json.loads(match.group(1)); identities[identity['name']] = identity
            except (ValueError, KeyError): pass
    # Expand transitive dependencies so shared-entry review includes compounds.
    direct = {name:set(values) for name,values in uses.items()}
    for referenced, ordinals in direct.items():
        pending = [referenced]; visited = set()
        while pending:
            current = pending.pop()
            if current in visited: continue
            visited.add(current)
            declaration = declarations.get(current)
            if not declaration: continue
            try: dependencies = {n.id for n in ast.walk(ast.parse('(' + declaration['expression'] + '\n)', mode='eval')) if isinstance(n,ast.Name)}
            except SyntaxError: dependencies = set()
            for dependency in dependencies:
                uses.setdefault(dependency, [])
                uses[dependency] = sorted(set(uses[dependency]) | ordinals)
            pending.extend(dependencies - visited)
    result=[]
    for name,value in sorted(namespace.items()):
        if name.startswith('_') or not (hasattr(value,'eval') and not inspect.isclass(value) or callable_allowed(name,value) and (not inspect.isclass(value) or name=='cop')): continue
        declaration=declarations.get(name,{})
        if name == 'cop': declaration={'expression':'Copula()','sourcePath':inspect.getsourcefile(value),'line':inspect.getsourcelines(value)[1],'kind':'helper'}
        if not declaration and inspect.isfunction(value):
            declaration={'expression':inspect.getsource(value),'sourcePath':inspect.getsourcefile(value),'line':inspect.getsourcelines(value)[1],'kind':'helper'}
        status=lexical_status(value)
        result.append({'id':identities.get(name,{}).get('id') or 'lexical:'+hashlib.sha256((str(corpus)+':'+name).encode()).hexdigest()[:24], 'name':name, 'kind':declaration.get('kind','word'), 'runtimeType':type(value).__name__, 'category':getattr(value,'category','helper'), 'definition':getattr(value,'definition',''), **({'lexicalStatus':status} if status else {}), 'expression':declaration.get('expression',name), 'sourcePath':declaration.get('sourcePath',inspect.getsourcefile(value if inspect.isclass(value) else type(value)) if hasattr(value,'eval') else None), 'line':declaration.get('line'), 'provenance':identities.get(name,{}).get('provenance') or {'project':'oldtupicorpus','source':declaration.get('sourcePath','engine'),'lexicalName':name}, 'uses':uses.get(name,[])})
    return result


def lexicon_result(payload, corpus, path, namespace):
    import unicodedata
    entries=lexical_entries(corpus,path,namespace,payload.get('line'))
    if payload['action']=='lexicon_context':
        return {'results':[entry for entry in entries if entry['name'] in payload.get('names',[])]}
    if payload['action']=='lexicon_inspect':
        entry=next((entry for entry in entries if entry['name']==payload['name']),None)
        if not entry: raise ValueError('Entrada lexical desconhecida.')
        value=namespace[entry['name']]
        if callable(value):
            parameters=[]
            for parameter in inspect.signature(value).parameters.values():
                default=parameter.default
                parameters.append({'name':parameter.name,'kind':parameter.kind.name,'required':default is inspect.Parameter.empty,'default':None if default is inspect.Parameter.empty else repr(default)})
            template=entry['expression'];context=[];diagnostics=[]
            try:
                syntax=ast.parse(template)
                if isinstance(syntax.body[0],ast.Expr) and isinstance(syntax.body[0].value,ast.Lambda):
                    template=ast.get_source_segment(template,syntax.body[0].value.body)
                elif isinstance(syntax.body[0],ast.FunctionDef):
                    function=syntax.body[0];returns=[node for node in function.body if isinstance(node,ast.Return)]
                    context=[ast.get_source_segment(template,node) for node in function.body if not isinstance(node,ast.Return)]
                    if len(returns)==1:template=ast.get_source_segment(template,returns[0].value)
                    else:diagnostics.append({'severity':'warning','message':'Helper com retorno condicional: consulte o corpo completo.'})
            except SyntaxError as error:diagnostics.append({'severity':'warning','message':str(error)})
            return {**entry,'parameters':parameters,'template':template,'templateContext':context,'authoring':expression_tree(template),'namedReference':expression_tree(entry['name']),'expandedStructure':None,'diagnostics':diagnostics,'editScopes':['occurrence','source','shared'],'affectedUses':entry['uses']}
        safe_expansion = None
        try:
            from reference_expansion import occurrence_copy
            safe_expansion = occurrence_copy(entry['name'], entries, namespace)
        except (SyntaxError, ValueError, TypeError, AttributeError, RecursionError):
            pass
        from reference_uses import reference_uses
        usage = reference_uses(corpus, entry['name'], entry['sourcePath'], entry['line']) if entry.get('sourcePath') and entry.get('line') else {'uses':[], 'diagnostics':['Declaração de origem indisponível.']}
        return {**entry, 'expandedStructure':shape(value), 'runtimeTree':runtime_graph(value), 'authoring':expression_tree(entry['expression']), 'namedReference':expression_tree(entry['name']), 'editScopes':['occurrence','source','shared'], 'affectedUses':entry['uses'], 'projectUses':usage, 'safeOccurrenceExpansion':safe_expansion}
    def fold(value): return ''.join(c for c in unicodedata.normalize('NFKD',value.casefold()) if not unicodedata.combining(c))
    query=fold(payload.get('query',''))
    from rendered_structures import normalize
    rendered_query = normalize(payload.get('query', ''))
    matches = []
    for entry in entries:
        try:
            value = namespace[entry['name']]
            if not inspect.isclass(value) and callable(getattr(value, 'eval', None)):
                entry['surface'] = str(evaluation_snapshot(value).eval())
        except Exception:
            pass
        if query in fold(entry['name'] + ' ' + str(entry['definition'])) or (rendered_query and rendered_query in normalize(entry.get('surface', ''))):
            matches.append(entry)
    return {'query':payload.get('query',''),'total':len(matches),'results':matches[:payload.get('limit',40)]}

def approve_authoritatively(payload, corpus):
    """Approve only the selected passage; gaps contain no synthesized references."""
    import uuid
    from studio_authoring import authoritative_metadata, source_directives, SOURCE_TEXT_FIELDS
    from passage_references import read, changes
    from reviewed_files import apply_reviewed_files
    from authoring.records import normalize_surface
    source=payload['sourceId']; ordinal=payload['ordinal']
    source_path=corpus/'historic'/f'{source}.tu.py'
    before=source_path.read_bytes()
    if 'sha256:'+hashlib.sha256(before).hexdigest()!=payload['sourceFileFingerprint']:
        raise ValueError('A fonte mudou desde a revisão.')
    entries=source_entries(source_path)
    entry=entries[ordinal-1]
    namespace=namespace_for(corpus,source_path,entry['line'])
    rendered=normalize_surface(str(interpret(parse_ast(entry['expression']),namespace).eval()))
    if rendered!=normalize_surface(payload['reviewedSurface']):
        raise ValueError('A superfície mudou desde a revisão.')
    records=read(corpus,source); prior=records.get(ordinal,{})
    identifier=payload.get('passageId') or (entry.get('studio') or {}).get('passageId')
    if not identifier: raise ValueError('A aprovação exige uma identidade estável da passagem.')
    if prior.get('studio_passage_id',identifier)!=identifier:
        raise ValueError('A identidade da referência mudou.')
    if prior.get('normalized_target') and normalize_surface(prior['normalized_target'])!=rendered:
        raise ValueError('A forma não coincide com o alvo humano declarado; ele não será substituído.')
    annotation=authoritative_metadata(corpus,source_path).get(ordinal,{})
    directives=source_directives(entry)
    record={**prior,'id':prior.get('id',f'{source}:{ordinal:04d}'),'source':source,
            'kind':'historic','ordinal':ordinal,'surface':rendered,'status':'approved',
            'studio_passage_id':identifier}
    for key,_ in directives:
        if key in SOURCE_TEXT_FIELDS and key!='note':
            field=SOURCE_TEXT_FIELDS[key]
            if annotation.get(field) is None: record.pop(field,None)
            else: record[field]=annotation[field]
    if any(key=='note' and not value.startswith(('studio:v1 ','studio-lexical:v1 ')) for key,value in directives):
        record['notes']=[note for note in annotation.get('notes',()) if not str(note).startswith(('studio:v1 ','studio-lexical:v1 '))]
    if record.get('normalized_target') and normalize_surface(record['normalized_target'])!=rendered:
        raise ValueError('A leitura @target da fonte não coincide com a superfície revisada.')
    records[ordinal]=record
    members=changes(corpus,source,records)
    # Include a read-only source guard in the same atomic review transaction.
    members.append({'path':source_path,'before':before,'after':before})
    journal_rows=[{'path':str(item['path']),'before':item['before'].decode('utf-8'),
                  'beforeExists':item.get('beforeExists',True),
                  'afterFingerprint':'sha256:'+hashlib.sha256(item['after']).hexdigest()} for item in members]
    journal={'version':2,**journal_rows[0],'files':journal_rows,'kind':'reference-approval',
             'ordinal':ordinal,'reviewedSurface':rendered,'status':'prepared'}
    def fail(message,code): raise ValueError(message)
    apply_reviewed_files(members,Path(payload['stateDir'])/'recovery'/(str(uuid.uuid4())+'.json'),journal,fail)
    return {'source':source,'ordinal':ordinal,'committed_surface':rendered}


def main():
    payload=json.load(sys.stdin)
    try:
        with redirect_stdout(sys.stderr):
            parent=Path(payload['parent']); corpus=configure(parent)
            path=corpus/'historic'/f"{payload.get('sourceId','araujo_catecismo_1686')}.tu.py"
            if payload.get('action') == 'learning_library':
                from learning_library import build
                result = build(corpus)
            elif payload.get('action') in {'structure_index', 'structure_resolve'}:
                from rendered_structures import build, resolve
                result = build(payload, corpus) if payload['action'] == 'structure_index' else resolve(payload, corpus)
            elif payload.get('action') == 'publication_snapshot':
                from publication_regression import snapshot
                result = snapshot(corpus)
            elif payload.get('action') == 'composition_define':
                from lexical_publication import define_composition
                result = define_composition(payload, corpus)
            elif payload.get('action') == 'node_definition':
                from node_definitions import define_node
                result = define_node({**payload, 'action': payload.get('definitionAction', 'set')}, corpus)
            elif payload.get('action') == 'prepare_lexical_publication':
                from lexical_publication import prepare_lexical_publication
                result = prepare_lexical_publication(payload, corpus)
            elif payload.get('action')=='approve':
                result=approve_authoritatively(payload,corpus)
            elif payload.get('action')=='verify':
                from passage_references import verify
                result=verify(corpus,payload['sourceId'])
            else:
                namespace=namespace_for(corpus,path,payload.get('line',10**9))
                if payload.get('action') == 'active_lexicon':
                    from active_lexicon import inventory
                    from rendered_structures import isolated_namespace
                    try:
                        evaluation = realize(payload['raw'], isolated_namespace(namespace, parse_ast(payload['raw'])))
                    except Exception as error:
                        evaluation = {'diagnostics': [{'message': 'A árvore foi preservada sem realização: ' + str(error)[:600]}]}
                    result = inventory(payload['raw'], corpus, path, namespace, source_line=payload.get('line'), evaluation=evaluation)
                elif payload.get('action') == 'predicate_catalog':
                    result = predicate_catalog(namespace)
                elif payload.get('action') == 'predicate_create':
                    result = predicate_create(payload,namespace)
                elif payload.get('action') == 'dictionary_predicate':
                    result = dictionary_predicate(payload,namespace)
                else:
                    result=lexicon_result(payload,corpus,path,namespace) if payload.get('action') in {'lexicon','lexicon_inspect','lexicon_context'} else realize(payload['raw'],namespace)
        print(json.dumps({'result':result},ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error':{'message':f'{type(error).__name__}: {error}','code':'ENGINE_CONTEXT_ERROR'}},ensure_ascii=False))
if __name__=='__main__': main()
