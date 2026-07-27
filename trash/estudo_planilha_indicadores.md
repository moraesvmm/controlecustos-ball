# Estudo da Planilha de Indicadores

**Arquivo:** `Indicadores_Manutenção.xlsx`

## Estrutura Identificada

### Aba: "Base de dados"
Esta aba consolida os dados de **Breakdowns** (em percentuais) em três visões temporais distintas, comparando o valor real alcançado (Breakdowns) com a meta estabelecida (Target).

1. **Visão Semanal (W0 a W52)**
   - Valores percentuais de quebras apurados semana a semana.
   - Target semanal (ex: 9.5%, 8.6%, 8.0%, 6.0%).

2. **Visão Diária (1 a 31)**
   - Valores apurados para cada dia do mês atual.
   - Target diário fixo (geralmente 8.3%).

3. **Visão Mensal (Jan a Dez)**
   - Valores consolidados mês a mês ao longo do ano.
   - Target mensal acompanhando a curva semanal.

### Outras Abas Observadas
O arquivo original possui abas auxiliares como `Painel de controle`, `Evidencias`, `Plano de ações`, `Preventiva_L7`, `Câmeras`, `CONSERTO`, `ATA DE REUNIÃO`, entre outras.

## Objetivo Futuro (Proposto)
Implementar uma funcionalidade de **Importação Automática** via interface do sistema. 
Ao invés de atualizar manualmente (mock) os valores no código-fonte, o usuário poderá fazer o upload deste arquivo Excel diretamente no "Controle RC", e o sistema se encarregará de ler essas informações (inclusive os cálculos de MTBF em outras abas) e preencher os gráficos do Dashboard de forma dinâmica.
