"""Optional escalation to Studio's existing MCP/provider loop.

This is a *task mode* for the existing agent, not a new agent framework. When a
contributor explicitly asks for it, the lab task is handed to the same iterative
loop with the same validated builder tools; whatever comes back is an ordinary
candidate that must pass the same validator.

Boundaries kept deliberately: ordinary parsing never invokes grammar repair;
dictionary and tool context stay answer-free during evaluation; a provider call
requires explicit user initiation under the existing budget policy; automated
tests use fixtures and spend no tokens.
"""
from __future__ import annotations

import os

TASK = {
    'id': 'parser-lab-analysis-v1',
    'mode': 'lab_analysis',
    'usesExistingLoop': True,
    'tools': ['scratch builder transactions', 'lab evaluation', 'dictionary lookup'],
    'excludes': ['grammar repair', 'source publication', 'reference approval'],
    'requiresExplicitStart': True,
    'translationRequired': False,
    'note': 'O fluxo normal de candidatos exige uma tradução tentativa em português. '
            'O contrato do laboratório dispensa essa etapa sem alterar o fluxo normal: '
            'traduzir não é um estágio necessário para analisar.',
}


def agent_status(providers=None):
    """What the escalation route would need. Never claims an unrun result."""
    configured = list(providers or [])
    if not configured:
        for name, variable in (('claude', 'ANTHROPIC_API_KEY'), ('codex', 'OPENAI_API_KEY')):
            if os.environ.get(variable):
                configured.append(name)
    return {
        'task': TASK,
        'available': bool(configured),
        'providers': configured,
        'state': 'ready' if configured else 'blocked',
        'ran': False,
        'reason': ('Escolha um provedor configurado e inicie a análise assistida explicitamente.'
                   if configured else
                   'Nenhum provedor está configurado nesta sessão. A análise offline continua '
                   'disponível; a assistência por IA exige início explícito e orçamento.'),
    }


def escalate(*_arguments, **_keywords):
    """Not executed automatically, and never as part of ordinary parsing."""
    raise NotImplementedError(
        'A escalada assistida exige início explícito do contribuidor e um provedor configurado.')
