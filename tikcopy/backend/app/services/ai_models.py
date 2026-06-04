"""IDs de modelo da Anthropic centralizados.

Trocar a versão de um modelo aqui reflete em todo o backend (claude.py, ai.py).
O modelo Boost (Opus) fica em ai.py por ser configurável via env COPY_BOOST_MODEL.
"""

SONNET_MODEL = "claude-sonnet-4-6"   # geração de copy + destilação do dossiê
HAIKU_MODEL = "claude-haiku-4-5"     # tarefas utilitárias (classificação, etc.)
