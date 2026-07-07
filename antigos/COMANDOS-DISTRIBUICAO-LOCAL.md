# Controle RC — Distribuição local (grupo / rede corporativa)

Este sistema **não precisa de Node.js nem npm**. O servidor na porta **8080** usa apenas o **Python** que já vem em muitos PCs Windows ou pode ser instalado uma vez pelo TI.

---

## Como o servidor na porta 8080 funciona

O comando é o servidor HTTP embutido do Python:

```powershell
cd C:\caminho\para\controle-rc-system
python -m http.server 8080
```

Isso serve os arquivos (`index.html`, `js/`, `css/`) em **http://localhost:8080**.  
O navegador precisa de HTTP (não abra o `index.html` com duplo clique).

**Atalhos prontos na pasta do projeto:**

| Arquivo | Uso |
|---------|-----|
| `INICIAR-SERVIDOR.bat` | Só **este PC** — abre o navegador e sobe a porta 8080 |
| `INICIAR-SERVIDOR-REDE.bat` | **Vários PCs na rede** — outros acessam `http://IP-DO-PC:8080` |

---

## O que copiar para outro PC

### Opção A — Sem Git (recomendado em PC corporativo)

1. Baixe o ZIP no navegador:  
   **https://github.com/moraesvmm/controle-rcs/archive/refs/heads/main.zip**
2. Extraia o arquivo (a pasta será `controle-rcs-main`).
3. Confira se existe **`js\env.runtime.js`**.
4. Duplo clique em **`INICIAR-SERVIDOR.bat`**.

### Opção B — Com Git

```powershell
git clone https://github.com/moraesvmm/controle-rcs.git
cd controle-rcs
```

Se aparecer *"git não é reconhecido"*, use a **Opção A** ou peça ao TI para instalar o [Git for Windows](https://git-scm.com/download/win).

### Opção C — Cópia direta

Copie a pasta inteira **`controle-rc-system`** (pendrive, rede, ZIP enviado por colega).

Não é necessário instalar nada além do **Python 3** (se ainda não tiver).

---

## Pré-requisito: Python 3

### Verificar se já tem Python

Abra **PowerShell** ou **CMD** e rode:

```powershell
python --version
```

ou:

```powershell
py -3 --version
```

Se aparecer `Python 3.x.x`, está ok.

### Instalar Python (se não tiver)

1. https://www.python.org/downloads/ — baixar **Python 3.11** ou superior  
2. Na instalação, marcar: **“Add python.exe to PATH”**  
3. Fechar e abrir o terminal de novo  
4. Testar: `python --version`

Em ambiente corporativo, o TI pode instalar via Software Center / política de grupo.

---

## Modo 1 — Cada pessoa no seu PC (recomendado)

Todos usam a **mesma pasta** (ou cópia idêntica) e o **mesmo Supabase**. Os dados ficam centralizados na nuvem; cada um só abre o sistema localmente.

### Passo a passo em cada PC

```powershell
# 1) Ir até a pasta do sistema
cd C:\ControleRC\controle-rc-system

# 2) (Opcional) Conferir configuração Supabase
notepad js\env.runtime.js

# 3) Subir servidor
python -m http.server 8080
```

Ou: duplo clique em **`INICIAR-SERVIDOR.bat`**.

### Abrir no navegador

```
http://localhost:8080
```

### Configuração Supabase (`js\env.runtime.js`)

Deve estar assim para o grupo compartilhar os mesmos dados:

```javascript
window.__ENV = {
  SUPABASE_URL: 'https://nnbzcukmuziyrobdqlnh.supabase.co',
  SUPABASE_ANON_KEY: 'sua_chave_anon_publishable',
  USE_LOCAL_DATA: 'false'
};
```

- `USE_LOCAL_DATA: 'false'` → todos leem/gravam no **mesmo banco**  
- `USE_LOCAL_DATA: 'true'` → cada PC usa só o JSON local (sem sincronizar)

### Parar o servidor

Na janela preta do terminal: **Ctrl + C**, ou feche a janela.

---

## Modo 2 — Um PC “servidor” e o grupo acessa pela rede

Útil se quiser **uma única pasta** no servidor de arquivos e todos abrem pelo IP.

### No PC que vai hospedar (servidor)

```powershell
cd C:\ControleRC\controle-rc-system
python -m http.server 8080 --bind 0.0.0.0
```

Ou duplo clique em **`INICIAR-SERVIDOR-REDE.bat`**.

### Descobrir o IP do servidor

```powershell
ipconfig
```

Procure **Endereço IPv4** (ex.: `10.50.12.34`).

### Nos outros PCs (clientes)

Abrir no Chrome/Edge:

```
http://10.50.12.34:8080
```

(substitua pelo IP real)

### Firewall Windows (se não abrir na rede)

PowerShell **como Administrador**:

```powershell
New-NetFirewallRule -DisplayName "Controle RC 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

Ou: Painel de Controle → Firewall → Regra de entrada → Porta TCP **8080**.

---

## Comandos úteis (copiar e colar)

### Subir servidor (só este PC)

```powershell
cd C:\Users\VMORAES1\controle-rc-system
python -m http.server 8080
```

### Subir servidor (rede inteira)

```powershell
cd C:\Users\VMORAES1\controle-rc-system
python -m http.server 8080 --bind 0.0.0.0
```

### Usar outra porta (se 8080 estiver ocupada)

```powershell
python -m http.server 9090
```

Acesse: `http://localhost:9090`

### Testar se a porta está em uso

```powershell
netstat -ano | findstr :8080
```

### Importar dados da planilha para o Supabase (só quem administra)

```powershell
cd C:\Users\VMORAES1\controle-rc-system
pip install requests
$env:SUPABASE_URL = "https://nnbzcukmuziyrobdqlnh.supabase.co"
$env:SUPABASE_SERVICE_KEY = "cole_a_service_role_key_aqui"
python scripts\import_to_supabase.py
```

### SQL do banco (uma vez, no site do Supabase)

Executar no SQL Editor, nesta ordem:

1. `supabase\migrations\001_schema.sql`  
2. `supabase\migrations\002_natureza_id.sql`

---

## Checklist para distribuir ao grupo

- [ ] Pasta `controle-rc-system` copiada para cada PC **ou** um PC servidor na rede  
- [ ] Python 3 instalado e no PATH  
- [ ] `js\env.runtime.js` com URL e chave **anon** do Supabase  
- [ ] `USE_LOCAL_DATA: 'false'` para dados compartilhados  
- [ ] SQL `001` e `002` já executados no Supabase  
- [ ] Teste: `INICIAR-SERVIDOR.bat` → abre `http://localhost:8080`  
- [ ] (Rede) Firewall liberou porta **8080** no PC servidor  

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| `'python' não é reconhecido` | Instalar Python com PATH ou usar `py -3 -m http.server 8080` |
| Página em branco / erro de módulo | Não abrir `index.html` direto; usar sempre `http://localhost:8080` |
| `npx` não funciona | Normal em PC corporativo; use **Python**, não Node |
| Outro PC não abre pelo IP | Firewall, `--bind 0.0.0.0`, mesmo Wi-Fi/rede |
| Dados não aparecem | Verificar `USE_LOCAL_DATA: 'false'` e conexão com internet (Supabase) |

---

## Resumo

- **Porta 8080** = comando `python -m http.server 8080`  
- **Mais fácil** = duplo clique em **`INICIAR-SERVIDOR.bat`**  
- **Grupo com mesmo banco** = todos com `USE_LOCAL_DATA: 'false'` e mesma chave Supabase  
- **Um servidor para todos** = **`INICIAR-SERVIDOR-REDE.bat`** + IP na rede  
