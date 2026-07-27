# Controle RC — Sistema Web

Sistema web equivalente à planilha **CONTROLE RC (1).xlsx**, com persistência em **Supabase**.

## Mapeamento Excel → Sistema

| Planilha Excel | Função no sistema |
|----------------|-------------------|
| **Planilha1** (Tabela4) | Tela **Controle RC** — cadastro principal com 24 colunas |
| **CONSERTO / COMPRA / FABRICAÇÃO** | Abas **Consertos**, **Compras**, **Fabricação** |
| Coluna **ID** | Agrupador do mesmo item (pode repetir em várias RCs, como no Excel) |
| **Planilha2** | **Dashboard** — 3 pivôs/gráficos |
| **Planilha3** | Gráficos de barras (Chart.js) |
| **DADOS_LIMPOS** | Base de referência importada em `data/rc_principal.json` |

### Fórmulas replicadas (`js/logic.js`)

| Coluna Excel | Campo calculado |
|--------------|-----------------|
| T — STATUS | `calcularStatus()` — ENTREGUE → PO → RC → ORÇAMENTO |
| Q — ANO PREVISTO | `calcularAnoPrevisto()` |
| U — VALOR PREVISTO | Mês da previsão ≥ mês atual |
| V — VALOR RECEBIDO | Valor se há data de recebimento |
| W — MÊS REFERÊNCIA | Mês da entrega ou previsão |
| X — MÁQUINA_LINHA | `máquina + " - " + linha` |
| K — DIAS FORA (Conserto) | `TODAY() - data_saída` |

### Slicers (filtros)

Natureza, Status, Criticidade, Linha, Máquina, Fornecedor + busca textual.

## Executar localmente (sem Node.js)

**Forma mais fácil:** duplo clique em `INICIAR-SERVIDOR.bat` (usa Python na porta 8080).

**Manual:**

```powershell
cd C:\Users\VMORAES1\controle-rc-system
python -m http.server 8080
```

Acesse: http://localhost:8080

**Distribuir para o grupo:** veja `COMANDOS-DISTRIBUICAO-LOCAL.md` e `COMANDOS-RAPIDOS.txt`.

**Vários PCs na rede:** use `INICIAR-SERVIDOR-REDE.bat` ou `python -m http.server 8080 --bind 0.0.0.0`.

## Configurar Supabase

### 1. Criar tabela

No [SQL Editor](https://supabase.com/dashboard/project/nnbzcukmuziyrobdqlnh/sql) do projeto, execute:

`supabase/migrations/001_schema.sql`

### 2. Variáveis

Edite `js/env.runtime.js` (ou rode `npm run build` com variáveis no ambiente):

```javascript
window.__ENV = {
  SUPABASE_URL: 'https://nnbzcukmuziyrobdqlnh.supabase.co',
  SUPABASE_ANON_KEY: 'sua_chave_anon',
  USE_LOCAL_DATA: 'false'
};
```

### 3. CLI Supabase (opcional)

```bash
supabase login
supabase init
supabase link --project-ref nnbzcukmuziyrobdqlnh
supabase db push
```

### 4. Importar dados do Excel

```powershell
$env:SUPABASE_SERVICE_KEY = "sua_service_role_key"
python scripts/import_to_supabase.py
```

## Estrutura do projeto

```
controle-rc-system/
├── index.html          # SPA principal
├── css/styles.css
├── js/
│   ├── logic.js        # Regras de negócio (fórmulas)
│   ├── db.js           # Supabase + fallback local
│   ├── charts.js       # Gráficos dashboard
│   └── app.js          # UI
├── data/rc_principal.json
├── supabase/migrations/001_schema.sql
└── scripts/import_to_supabase.py
```

## Fluxo lógico do RC

1. Peça enviada para conserto/serviço → cadastro com **orçamento**
2. Aprovado → preenche **RC**
3. Pedido emitido → **PO**
4. Aguardando → **PENDENTE DE ENTREGA**
5. Recebido → **DATA RECEBIMENTO** → status **ENTREGUE**

O dashboard consolida custos por status, previstos vs recebidos por mês, e gastos por máquina/linha.

## Hospedar na Vercel

Sim — o projeto é **estático** (HTML + JS) e funciona na Vercel sem backend próprio. O banco continua no **Supabase**.

### Passo a passo

1. Suba o projeto no **GitHub** (pasta `controle-rc-system`).

2. Acesse [vercel.com/new](https://vercel.com/new) → **Import** do repositório.

3. Em **Environment Variables**, adicione:

| Nome | Valor |
|------|--------|
| `SUPABASE_URL` | `https://nnbzcukmuziyrobdqlnh.supabase.co` |
| `SUPABASE_ANON_KEY` | chave **anon / publishable** do Supabase |
| `USE_LOCAL_DATA` | `false` |

4. Clique em **Deploy**. A Vercel roda `npm run build` e publica o site.

5. No Supabase → **Authentication** → **URL Configuration**, adicione a URL da Vercel (ex.: `https://seu-app.vercel.app`) se usar login no futuro. Para REST com anon key, confira **RLS** das policies em `rc_registros`.

### Deploy pela CLI (opcional)

```bash
cd controle-rc-system
npm i -g vercel
vercel
```

Na primeira vez, informe as mesmas variáveis de ambiente quando solicitado.

### Observações

- Não commite a **service_role** na Vercel — só a chave **anon/publishable** no front-end.
- O script Python de importação (`scripts/import_to_supabase.py`) roda **localmente**, não na Vercel.
- Arquivo `vercel.json` já está configurado na raiz do projeto.
