# Vistorias do Sistema

Este documento registra a necessidade de vistorias técnicas após alterações substanciais no código-fonte.

## Histórico de Modificações

### ⚠️ 01/06/2026 — VISTORIA PENDENTE — Separação Front-end / Back-end (Planos de Manutenção)
**Status: PENDENTE — Realizar vistoria o mais rápido possível.**

- Alterações realizadas:
  - `css/styles.css`: Adicionados estilos para accordion sidebar e badges FE/BE.
  - `index.html`: Sidebar convertida para accordions com sub-menus Back-end/Front-end. Clonadas views `#view-planos-manutencao-frontend` e `#view-plano-preventiva-frontend`. Adicionado modal `#modalEditarAtividadeFE`.
  - `js/import_excel_preventiva.js`: Adicionada função `initExcelImportPreventivaFrontend()` que lê aba `FRONT-END` e insere registros com `setor='frontend'`. Deleta apenas registros frontend nunca backend.
  - `js/app.js`: Adicionada variável `registrosPreventivaFrontend`. Split de dados no `init()`. Expandido `showView` com rotas FE. Adicionadas funções: `estadoPlanosFrontend`, `planosGoToStepFrontend`, `selecionarMesPlansosFrontend`, `selecionarLinhaPlanosFrontend`, `selecionarMaquinaPlanosFrontend`, `renderTabelaPreventivaFE`, `setupPlanoPreventivaUIFrontend`, `abrirFormularioPreventivaFE`, `abrirDetalhePreventivaFEPanel`. Accordion handler no `init()`. Import da função `initExcelImportPreventivaFrontend`.
- **Verificações necessárias na vistoria:**
  - Navegar pelas 4 rotas: `planos-manutencao`, `planos-manutencao-frontend`, `plano-preventiva`, `plano-preventiva-frontend`.
  - Confirmar que Back-end não exibe registros com `setor='frontend'`.
  - Confirmar que importar planilha FE não apaga dados BE.
  - Verificar console limpo (sem SyntaxError, TypeError, 404).
  - Confirmar `#secaoTabela` visível no CRUD (RC, Consertos, Compras, Fabricação).

### 29/05/2026 - Módulo de Preventiva
- Modificações realizadas:
  - Adição da tabela `preventiva_registros` no banco (via Supabase RLS).
  - Atualização do `index.html` (modal e view exclusiva para Preventiva).
  - Atualização do `js/app.js` e `js/db.js` (operações de CRUD para Preventiva).
  - Criação do `js/import_excel_preventiva.js` para parsing de planilha.
- **Status da Vistoria**: PENDENTE (deve ser feita o mais rápido possível para validar todas as instâncias de carregamento e importação da preventiva na Linha 06).

### 29/05/2026 - Conclusão da Arquitetura UI Módulo Preventiva
- Modificações realizadas:
  - Criação da Landing Page "Controle" (`#view-controle-preventiva`).
  - Substituição do Modal por Formulário em Tela Cheia (`#view-form-preventiva`).
  - Implementação de Sub-abas Expansíveis na Sidebar ("Preventiva L(06)").
  - Ajuste nas colunas da tabela (Thead vs Tbody) para alinhamento.
- **Status da Vistoria**: PENDENTE (revisar roteamento das views e comportamento do formulário em tela cheia).

### 29/05/2026 - Arquitetura Preventiva Fase 2 (Hub L06 e Sub-sub-abas)
- Modificações realizadas:
  - Adição do menu Flyout (deslizante) no Sidebar para as sub-sub-abas "Back-End" e "Front-End" da L(06).
  - Transformação da view de Tabela pura para uma Hub central para a L(06) (`#view-preventiva-l06`).
  - Atualização do design do KPI "Atividades" no Hub principal de Controle.
  - O botão "+ Nova Linha" agora simula a criação de um novo hub de produção, e não mais um registro unitário da tabela.
  - A tabela migrou definitivamente para `#view-preventiva-l06-backend`.
- **Status da Vistoria**: PENDENTE (testar expansão do menu em `:hover` e garantir que os dados antigos renderizam perfeitamente na aba Back-End).
