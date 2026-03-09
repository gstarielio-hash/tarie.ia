# Roadmap WF - Backlog Mestre

Atualizado em: 2026-03-09

Este documento consolida a "etapa antiga" para nao perder prioridade durante as proximas entregas.

Legenda de status:
- `FEITO`: funcionalidade implementada e integrada ao fluxo principal.
- `PARCIAL`: existe base implementada, faltam regras/UX/validacoes para fechar.
- `PENDENTE`: ainda nao implementado.

## Melhorias de alto impacto

| ID | Item | Status | Evidencia atual | Proximo passo |
|---|---|---|---|---|
| HI-01 | Modo guiado por servico WF (RTI, SPDA, PIE, LOTO, NR12, NR13, AVCB) com checklist obrigatorio | `PARCIAL` | Ja existe escolha de modalidade e inicio de laudo por template no fluxo de nova inspecao | Criar checklists por norma com bloqueio de finalizacao enquanto itens criticos nao forem atendidos |
| HI-02 | Chat unico com trilhas visuais por tipo de mensagem (IA, Mesa, Inspetor, Sistema) | `PARCIAL` | Ja existe diferenciacao de mensagens e whisper para mesa | Padronizar visual e legenda em todos os paineis com filtros por tipo |
| HI-03 | Botao "Chamar Mesa" alem do `@insp` | `FEITO` | Interface do inspetor ja possui acao de fala com mesa e suporte a `@insp` | Fazer QA de usabilidade e telemetry de uso do botao vs comando textual |
| HI-04 | Gate de qualidade antes de finalizar (campos criticos, evidencias minimas, fotos essenciais) | `FEITO` | Validacao server-side por template, endpoint de gate e modal de checklist no front com retorno estruturado | Monitorar metricas de bloqueio por template e ajustar thresholds com dados reais de campo |
| HI-05 | Confianca da IA por secao (alta/media/baixa) e destaque de validacao humana | `FEITO` | Analise automatica de confianca por secao integrada ao stream da IA, persistida no laudo e renderizada no chat com pontos de validacao humana | Calibrar pesos da heuristica com feedback de campo e telemetria de acuracia |
| HI-06 | Pacote de inspecao automatico para mesa (resumo executivo, pendencias, fotos indexadas, rascunho) | `PARCIAL` | Ja existe pendencias, resumo no painel de revisao e exportacao de PDF de pendencias | Consolidar endpoint unico para pacote completo e viewer de anexos indexados |
| HI-07 | Versionamento de revisao (v1, v2, v3) com diff entre versoes | `FEITO` | Tabela `laudo_revisoes` com snapshots versionados, endpoint de listagem e endpoint de diff unificado entre versoes | Adicionar comparador visual no front e acao rapida para abrir diff no painel |
| HI-08 | Biblioteca de nao conformidades recorrentes WF | `PENDENTE` | Sem biblioteca dedicada no dominio | Criar catalogo (categoria, causa, recomendacao, risco, norma) e sugestao no chat |
| HI-09 | Trilha de auditoria completa (autor, validador, horario, IP, evidencias) | `PARCIAL` | Ja existe registro de mensagens e eventos basicos de sessao/login | Unificar trilha auditavel por evento com exportacao e rastreabilidade de evidencias |
| HI-10 | Modo offline em campo com sincronizacao | `PENDENTE` | Sem fila offline no cliente | Implementar armazenamento local + fila de sync com conciliacao e conflitos |
| HI-11 | Comandos rapidos no chat (`/pendencias`, `/resumo`, `/enviar_mesa`, `/gerar_previa`) | `FEITO` | Parser de slash commands integrado ao `/api/chat` com respostas operacionais e persistencia no historico | Monitorar uso por comando e criar telemetria para comandos mais acionados |
| HI-12 | Dashboard operacional com KPIs reais (tempo laudo, retrabalho, SLA mesa, aprovacao na 1a revisao) | `PARCIAL` | Ja existe base de dados e status para medir SLA e fluxo | Criar agregacoes por periodo e painel com filtros por empresa/modo/template |

## Melhorias de produto/negocio

| ID | Item | Status | Evidencia atual | Proximo passo |
|---|---|---|---|---|
| BN-01 | Separar perfis: Admin Operacional e Super Admin SaaS | `PARCIAL` | Ja existe diferenciacao de niveis e rotas administrativas | Formalizar papeis e permissoes granulares por escopo de operacao vs SaaS |
| BN-02 | Transformar modalidades em produtos com precificacao e SLA proprios | `PENDENTE` | Modalidades existem no fluxo, sem camada comercial/SLA dedicada | Criar modelagem de catalogo de produtos e regras de plano por modalidade |
| BN-03 | Onboarding por segmento industrial (metalurgia, agro, quimica, alimentos) | `PENDENTE` | Sem jornada de onboarding segmentada | Criar trilhas de onboarding com templates, exemplos e checklists por setor |

## Ordem de execucao recomendada (alto impacto + baixo risco)

1. `HI-01` Checklist obrigatorio por modalidade/norma.
2. `HI-06` Pacote automatico para mesa.
3. `HI-08` Biblioteca de nao conformidades recorrentes.
4. `HI-10` Modo offline em campo com sincronizacao.
5. `HI-12` Dashboard operacional com KPIs e metas por SLA.

## Definicao de pronto atendida (`HI-04`)

1. Validacao server-side bloqueando finalizacao sem campos/fotos obrigatorios por template.
2. Retorno de erro estruturado indicando exatamente o que falta.
3. Feedback visual no front do inspetor com checklist de pendencias para envio.
4. Testes automatizados cobrindo fluxo permitido e bloqueado.
