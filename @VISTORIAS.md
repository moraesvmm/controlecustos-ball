# Vistorias do Sistema

Este documento registra a necessidade de vistorias técnicas após alterações substanciais no código-fonte.

## Histórico de Modificações

### ✅ 01/06/2026 — VISTORIA CONCLUÍDA — Separação Front-end / Back-end (Planos de Manutenção)
**Status: CONCLUÍDO.**

- Alterações realizadas:
  - `css/styles.css`: Adicionados estilos para accordion sidebar e badges FE/BE.
  - `index.html`: Sidebar convertida para accordions com sub-menus Back-end/Front-end. Clonadas views `#view-planos-manutencao-frontend` e `#view-plano-preventiva-frontend`. Adicionado modal `#modalEditarAtividadeFE`.
  - `js/import_excel_preventiva.js`: Adicionada função `initExcelImportPreventivaFrontend()` que lê aba `FRONT-END` e insere registros com `setor='frontend'`. Deleta apenas registros frontend nunca backend.
  - `js/app.js`: Adicionada variável `registrosPreventivaFrontend`. Split de dados no `init()`. Expandido `showView` com rotas FE. Adicionadas funções: `estadoPlanosFrontend`, `planosGoToStepFrontend`, `selecionarMesPlansosFrontend`, `selecionarLinhaPlanosFrontend`, `selecionarMaquinaPlanosFrontend`, `renderTabelaPreventivaFE`, `setupPlanoPreventivaUIFrontend`, `abrirFormularioPreventivaFE`, `abrirDetalhePreventivaFEPanel`. Accordion handler no `init()`. Import da função `initExcelImportPreventivaFrontend`.

### 29/05/2026 - Módulo de Preventiva
- Modificações realizadas:
  - Adição da tabela `preventiva_registros` no banco (via Supabase RLS).
  - Atualização do `index.html` (modal e view exclusiva para Preventiva).
  - Atual1. **Módulo de Animação e Preventiva Frontend:** Finalizado efeito premium (`floatFadeCard`).
2. **Contato de Fornecedores e SLA:** Adicionado CRUD de contatos, modal e botões nativos (`mailto:` e `wa.me/`) no drilldown.
3. **Dashboard:** Implementado mapa de calor (Heatmap) de ocorrências por Máquina x Mês usando `chartjs-chart-matrix`.

**Próxima Ação Pendente:** Vistoria arquitetural completa (obrigatória devido ao volume de alterações recentes).
**STATUS DA VISTORIA:** 🔴 PENDENTE
**Data:** 08/06/2026 - Conclusão da Arquitetura UI Módulo Preventiva
- Modificações realizadas:
  - Criação da Landing Page "Controle" (`#view-controle-preventiva`).
  - Substituição do Modal por Formulário em Tela Cheia (`#view-form-preventiva`).
  - Implementação de Sub-abas Expansíveis na Sidebar ("Preventiva L(06)").
  - Ajuste nas colunas da tabela (Thead vs Tbody) para alinhamento.
- **Status da Vistoria**: PENDENTE

### 29/05/2026 - Arquitetura Preventiva Fase 2 (Hub L06 e Sub-sub-abas)
- Modificações realizadas:
  - Adição do menu Flyout (deslizante) no Sidebar para as sub-sub-abas "Back-End" e "Front-End" da L(06).
  - Transformação da view de Tabela pura para uma Hub central para a L(06) (`#view-preventiva-l06`).
  - Atualização do design do KPI "Atividades" no Hub principal de Controle.
  - O botão "+ Nova Linha" agora simula a criação de um novo hub de produção, e não mais um registro unitário da tabela.
  - A tabela migrou definitivamente para `#view-preventiva-l06-backend`.
  - Foi adicionada a animação `.floatFadeCard` para sinalização visual de alterações.
- **Status da Vistoria**: CONCLUÍDO.
