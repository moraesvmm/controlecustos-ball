# 📚 Documentação Técnica — Controle RC System

> **Documento Fonte da Verdade**: Este documento rege as diretrizes arquiteturais, integrações e convenções de código do sistema *Controle RC System*. Qualquer alteração profunda ou manutenção futura deve se referenciar nesta documentação antes de proceder com as edições.

---

## 1. Visão Geral do Sistema
O **Controle RC System** é uma plataforma abrangente de gestão de manutenções, controle de custos e rastreamento de ordens (RCs, Consertos, Compras, Fabricação) e Planos de Manutenção Preventiva.

- **Stack Tecnológico**: Frontend puramente em Vanilla HTML, JavaScript e CSS (Sem frameworks de componentização pesados, mas arquitetado dinamicamente). Backend totalmente "Serverless" através de BaaS.
- **Backend / Banco de Dados**: Gerido via **Supabase** (PostgreSQL + REST API).
- **Hospedagem / Deploy**: O sistema atualmente está hospedado na **Vercel**.
- **Código Legado**: Todo código escrito em arquivos `.py` dentro do repositório é considerado **código-morto** e não deve ser utilizado, alterado ou invocado.

## 2. Inventário de Conexões e Credenciais Essenciais
As seguintes chaves são cruciais para investigações, modificações diretas de DB ou disparo de gatilhos externos:

### 2.1. Supabase (Database & Auth)
- **SERVICE ROLE / JWT**: `[REDACTED_BY_SYSTEM]`
- **Management Key (Execução de SQL)**: `[REDACTED_BY_SYSTEM]`
- **URI do Banco (PostgreSQL)**: `[REDACTED_BY_SYSTEM]`

### 2.2. Microsserviços & APIs Externas
- **Microsserviço de WhatsApp (Hospedado no Railway)**: Token de acesso `[REDACTED_BY_SYSTEM]`. Usado para disparos de notificações/avisos do sistema via WhatsApp.
- **Resend (Email)**: Chave de API `[REDACTED_BY_SYSTEM]`. Utilizada para o disparo transacional de e-mails do sistema.

---

## 3. Estrutura e Padrão do Frontend (Vanilla SPA)
O sistema funciona majoritariamente como uma Single Page Application construída com Vanilla JS.

- **Roteamento de Views**: 
  A troca de telas (views) é gerenciada ativamente pela função `showView(name)` localizada no `js/app.js`. As visualizações estão marcadas no `index.html` pela classe `.view` e um ID único no formato `#view-[nome]`. 
  As abas/links de navegação são ancorados através do atributo `data-tab`.
- **Estética & UX**: O design pattern foca fortemente no padrão "Deep Dark Blue" misturado a tons *Premium Gold*. Componentes em *Glassmorphism*, modais escuros, e badges com subtons são esperados em todo novo design.

---

## 4. Arquitetura dos Planos de Manutenção Preventiva (O Splitting Back/Front)
O módulo de Planos de Manutenção Preventiva sofreu um grande avanço arquitetural para dividir as escopos de "Back-end" e "Front-end" do chão de fábrica/produção.
Para evitar clonagem no Supabase (criação de tabelas "preventiva_front" redundantes), estabeleceu-se a **Segmentação por Coluna**.

### 4.1. Estrutura de Banco de Dados (`preventiva_registros`)
A tabela mestre das manutenções recebeu a coluna `setor` (tipo texto).
- Registros em que `setor === 'frontend'` são isolados para a gestão Front-end.
- Registros em que o `setor` é nulo (padrão histórico) ou explicitamente configurado para backend são isolados para a gestão de Back-end.

### 4.2. Segregação de Visualizações (`index.html`)
As telas do navegador e do gerador automático de planos foram completamente clonadas (hard copy). Isso garante flexibilidade máxima: caso a tela do Frontend precise de uma tabela, botão ou design totalmente diferente do backend, uma não irá interferir na outra.
- View Original (Back-end): `#view-planos-manutencao`
- View Nova (Front-end): `#view-planos-manutencao-frontend`

### 4.3. Regras e Operações JavaScript (`js/app.js`)
As funções de preenchimento de UI, validação e deleção foram duplicadas e encapsuladas. As funções que carregam o sufixo `Frontend()` (Ex: `setupPlanoPreventivaUIFrontend()`, `carregarAtividadesPlanoFrontend()`) lidam unicamente com as rotinas da nova interface.
- **Regra de Escrita (Front)**: Todo insert vindo do gerador de planos frontend anexa forçadamente `setor: 'frontend'`.
- **Regra de Substituição/Deleção (Front)**: O Supabase obriga a exclusão filtrada. O frontend exclui o plano anterior rigorosamente anexando `.eq('setor', 'frontend')` e verificando explicitamente `máquina`, `mês` e `linha`.
- **Filtro Retrospectivo (Back)**: As funções raízes que não possuem o sufixo "Frontend" ganharam `.filter(r => r.setor !== 'frontend')` ou cláusulas semelhantes para se blindarem das contaminações.

### 4.4. UI Enhancements Customizados: "Floating Edit Card"
No **Gerador de Planos Automático**, criamos um feedback em tempo real para os ajustes do usuário:
Ao usuário clicar duas vezes e **editar** uma atividade, ao salvar o modal, um card flutuante premium (*Glassmorphic, bordas douradas*) é ancorado na primeira célula da respectiva linha. Este card brilha com um "pulse" dourado e desaparece vagarosamente graças a animações via CSS Keyframes (`floatFadeCard` e transições de opacidade em `styles.css`), garantindo fluidez premium.

---

## 5. Regras de Compliance & Boas Práticas
1. **Sincronia Frontend/Database**: Sempre que criar ou deletar propriedades vitais em uma tabela Supabase que reflete nas tabelas do sistema, atualize IMEDIATAMENTE a query de leitura e o `innerHTML` da respectiva view no Frontend. Índices e colunas orfãs são inaceitáveis.
2. **Atualização de Documentação Dinâmica**: Toda vez que o sistema receber a inserção de uma funcionalidade relevante ou pelo menos *3 alterações sistêmicas*, você deve abrir e editar o arquivo `@VISTORIAS.md`. Lá, registre uma pendência sinalizando o que foi feito e que uma nova vistoria de Qualidade (QA) deve ser efetuada o mais breve possível.
3. **Instalações e Execuções**: Atuamos em uma máquina/rede corporativa limitante. Privilegie instalações locais ou execuções "silenciosas" ao usar scripts de CLI para evitar flags da segurança corporativa.
4. **Atualização Visual (Checkout)**: Sempre que implementarmos novos recursos, lembre-se de atualizar os cards de informações pertinentes (na página de "checkout" ou dashboards correspondentes) para que o usuário sinta que a ferramenta evoluiu.
