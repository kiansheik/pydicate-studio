"""Portable lexical hypotheses, independent of semantic definitions.

Status lives in an ordinary constructor tag so a reviewed lexicon needs no
Studio-only imports. Explicit grammar is initialized through selected-engine
arguments, then the contributor's semantic definition is restored separately.
"""
from __future__ import annotations

import ast
import inspect
import re


HYPOTHETICAL_TAG = '[LEXICAL_STATUS:HYPOTHETICAL]'
_RELATIONS = ('arguments', 'compositions', 'pre_adjuncts', 'post_adjuncts',
              'v_adjuncts', 'v_adjuncts_pre', 'principal', '_subject', '_arguments', 'arg0')


def lexical_status(value):
    """Retain uncertainty on compositions containing a hypothetical predicate."""
    pending = [value]; seen = set()
    while pending:
        current = pending.pop()
        if id(current) in seen or inspect.isclass(current):
            continue
        seen.add(id(current))
        if getattr(current, '_studio_lexical_status', None) == 'hypothetical':
            return 'hypothetical'
        if not hasattr(current, 'eval'):
            continue
        if HYPOTHETICAL_TAG in str(getattr(current, 'tag', '') or ''):
            return 'hypothetical'
        attributes = vars(current) if hasattr(current, '__dict__') else {}
        for name in _RELATIONS:
            child = attributes.get(name)
            pending.extend(child if isinstance(child, (list, tuple)) else [child])
    return None


def inherit_lexical_status(value, *inputs):
    """Carry authoring evidence when an engine conversion replaces its object.

    This private field is excluded from engine shape fingerprints and never
    changes the engine's morphological tags or generated surface.
    """
    if (not inspect.isclass(value) and hasattr(value, 'eval')
            and lexical_status(value) != 'hypothetical'
            and any(lexical_status(item) == 'hypothetical' for item in inputs)):
        value = _marked_snapshot(value)
    return value


def _marked_snapshot(value):
    # Helpers can return an unrelated shared singleton. Isolate its complete
    # object graph before attaching evidence, including engine self-links.
    # The local import avoids the runtime/metadata module initialization cycle.
    from authoring_runtime import evaluation_snapshot
    result = evaluation_snapshot(value)
    result._studio_lexical_status = 'hypothetical'
    return result


def restore_namespace_lexical_status(namespace, statements):
    """Recover uncertainty from saved declaration dependencies without execution.

    Some selected-engine conversions erase both tags and operand links. Their
    source declarations still identify the hypothetical dependency. Helper free
    variables are treated conservatively across branches; this is uncertainty
    tracking, not a claim that a source branch has executed.
    """
    declarations = {}
    for statement in statements:
        if isinstance(statement, ast.Assign):
            for target in statement.targets:
                if isinstance(target, ast.Name): declarations[target.id] = statement.value
        elif isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
            declarations[statement.target.id] = statement.value
        elif isinstance(statement, ast.FunctionDef):
            declarations[statement.name] = statement
    reverse = {}
    uncertain = {name for name, value in namespace.items() if lexical_status(value) == 'hypothetical'}
    for name, expression in declarations.items():
        if expression is None: continue
        nodes = list(ast.walk(expression))
        bound = {node.arg for node in nodes if isinstance(node, ast.arg)}
        bound.update(node.id for node in nodes if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store))
        for node in nodes:
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id not in bound:
                reverse.setdefault(node.id, set()).add(name)
            if (isinstance(node, ast.keyword) and node.arg == 'tag'
                    and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)
                    and HYPOTHETICAL_TAG in node.value.value):
                uncertain.add(name)
    pending = list(uncertain)
    while pending:
        for name in reverse.get(pending.pop(), ()):
            if name not in uncertain:
                uncertain.add(name); pending.append(name)
    for name in uncertain & declarations.keys():
        value = namespace.get(name)
        if inspect.isclass(value) or lexical_status(value) == 'hypothetical':
            continue
        if hasattr(value, 'eval'):
            namespace[name] = _marked_snapshot(value)
        elif inspect.isfunction(value) and isinstance(declarations[name], (ast.FunctionDef, ast.Lambda)):
            value._studio_lexical_status = 'hypothetical'


def _pluriform(value, name):
    morphology = getattr(value, 'noun' if name == 'Noun' else 'verb', None)
    if morphology is None:
        raise ValueError('O motor selecionado não expõe a classe desta raiz.')
    kind = getattr(morphology, 'pluriforme', None)
    if name == 'Verb' and kind:
        kind = getattr(morphology, 'pluriforme_type', None)
    return str(kind).replace(' ', '') if kind else 'none'


def prepare_lexical_arguments(name, values, options, constructor):
    """Return portable constructor arguments, optional gloss, checked options."""
    if options is None:
        return values, None, None
    if not isinstance(options, dict) or set(options) - {'pluriform', 'verbClass', 'status'}:
        raise ValueError('Propriedades lexicais inválidas.')
    if name not in {'Noun', 'Verb'}:
        raise ValueError('As propriedades lexicais se aplicam a nomes e verbos.')
    options = {'pluriform': 'default', 'verbClass': 'default', 'status': 'unspecified', **options}
    allowed_pluriform = {'default', 'none', 't', 's', 'm' if name == 'Noun' else 't,t'}
    if (not isinstance(options['pluriform'], str) or options['pluriform'] not in allowed_pluriform
            or not isinstance(options['verbClass'], str)
            or options['verbClass'] not in {'default', 'intransitive', 'transitive', 'stative'}
            or name == 'Noun' and options['verbClass'] != 'default'
            or not isinstance(options['status'], str)
            or options['status'] not in {'unspecified', 'hypothetical'}):
        raise ValueError('Classe lexical não disponível para este tipo de predicado.')
    values = dict(values)
    if options['status'] == 'hypothetical':
        parameter = inspect.signature(constructor).parameters.get('tag')
        if parameter is None:
            raise ValueError('Este construtor não preserva o estatuto de hipótese lexical.')
        tag = values.get('tag', parameter.default)
        if not isinstance(tag, str):
            raise ValueError('A anotação lexical deste construtor não é compatível.')
        values['tag'] = tag if HYPOTHETICAL_TAG in tag else tag + HYPOTHETICAL_TAG
    if options['pluriform'] == 'default' and options['verbClass'] == 'default':
        return values, None, options
    definition = values.get('definition', '')
    if 'definition' not in inspect.signature(constructor).parameters:
        raise ValueError('Este construtor não permite separar classe e significado.')
    if name == 'Noun':
        values['definition'] = '' if options['pluriform'] == 'none' else '(' + options['pluriform'] + ')'
    else:
        original = constructor(**values)
        pluriform = options['pluriform']
        if pluriform == 'default':
            pluriform = _pluriform(original, name)
        marker = '' if pluriform == 'none' else '(' + pluriform.replace(',', ', ') + ')'
        class_name = options['verbClass']
        if class_name == 'default':
            grammar = str(getattr(original.verb, 'verb_class', '') or '')
            grammar = re.sub(r'\((?:t\s*,\s*t|r\s*,\s*s|[ts])\)|-s-', '', grammar).strip()
        else:
            grammar = {'intransitive': 'v.intr.', 'transitive': 'v.tr.', 'stative': 'adj.'}[class_name]
        values['verb_class'] = ' '.join(part for part in (marker, grammar) if part)
        # A semantic gloss can contain dictionary grammar markers. They must
        # not silently override the explicit contributor choices.
        values['definition'] = marker
    return values, definition, options


def verify_lexical_arguments(value, name, options):
    if options is None:
        return
    if options['pluriform'] != 'default' and _pluriform(value, name) != options['pluriform']:
        raise ValueError('O motor substituiu a classe pluriforme solicitada, possivelmente por uma acepção do dicionário. A raiz não foi criada; revise a classe ou a entrada.')
    if name == 'Verb' and options['verbClass'] != 'default':
        morphology = value.verb
        actual = 'stative' if getattr(morphology, 'segunda_classe', False) else 'transitive' if getattr(morphology, 'transitivo', False) else 'intransitive'
        if actual != options['verbClass']:
            raise ValueError('O motor substituiu a classe verbal solicitada, possivelmente por uma acepção do dicionário. A raiz não foi criada; revise a classe ou a entrada.')
    if options['status'] == 'hypothetical' and lexical_status(value) != 'hypothetical':
        raise ValueError('O motor não preservou o estatuto de hipótese lexical.')
