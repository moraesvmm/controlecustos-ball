# PC corporativo — "The operation is blocked by your policy"

Mensagem comum quando o TI bloqueia instalações, scripts ou ferramentas.  
**Não é erro do Controle RC** — é restrição da máquina.

---

## O que costuma estar bloqueado

| Ação | Alternativa |
|------|-------------|
| `winget install Git` | Baixar ZIP no navegador (não usar winget) |
| `git clone` | ZIP: https://github.com/moraesvmm/controle-rcs/archive/refs/heads/main.zip |
| Duplo clique em `.bat` | Abrir servidor **manualmente** (abaixo) |
| PowerShell scripts | Usar **CMD** (Prompt de Comando) |
| Instalar Python/Git | Pedir ao TI ou copiar pasta de colega |

---

## Passo a passo SEM .bat e SEM Git

### 1) Baixar o projeto (só navegador)

1. No **Edge/Chrome**, abra:  
   https://github.com/moraesvmm/controle-rcs/archive/refs/heads/main.zip  
2. Se o GitHub também for bloqueado, peça o ZIP por **e-mail, Teams ou pasta de rede** (alguém do grupo envia).
3. Extraia para uma pasta que você tenha permissão, por exemplo:  
   `C:\Users\SEU_USUARIO\Documents\controle-rcs-main`

### 2) Subir o servidor SEM Python (PowerShell — ja vem no Windows)

Duplo clique em **`INICIAR-SERVIDOR-POWERSHELL.bat`**

Ou no PowerShell:

```powershell
cd C:\Users\vmarque2\Documents\controle-rc-system
powershell -ExecutionPolicy Bypass -File .\servidor.ps1 -Porta 8080
```

### 2b) Se tiver Python

```cmd
cd C:\Users\SEU_USUARIO\Documents\controle-rcs-main
py -3 -m http.server 8080
```

Se **Python e PowerShell estiverem bloqueados**, pule para **"Um PC servidor para todos"**.

### 3) Abrir o sistema

No navegador: **http://localhost:8080**

---

## Se o .bat for bloqueado mas PowerShell funcionar

Abra PowerShell e rode **só estas linhas** (não instala nada):

```powershell
cd C:\Users\SEU_USUARIO\Documents\controle-rcs-main
py -3 -m http.server 8080
```

---

## Se NADA rodar na sua máquina (Python + .bat bloqueados)

**Um colega** com permissão vira "servidor":

1. Na máquina dele, pasta do projeto + servidor na rede:
   ```cmd
   cd C:\caminho\controle-rcs-main
   py -3 -m http.server 8080 --bind 0.0.0.0
   ```
2. Ele informa o **IPv4** (`ipconfig`), ex.: `10.50.12.34`
3. No **seu** navegador (só Edge/Chrome, sem instalar nada):
   ```
   http://10.50.12.34:8080
   ```
4. Todos usam o mesmo Supabase (`js\env.runtime.js` com `USE_LOCAL_DATA: 'false'`) — CRUD funciona para o grupo.

---

## Mensagem ao TI (copiar e colar)

> Preciso usar o sistema interno **Controle RC** (site estático HTML/JS + banco Supabase na nuvem).  
> Solicito uma das opções:  
> 1) Liberar execução de **Python 3** apenas o comando `python -m http.server` na pasta do projeto, ou  
> 2) Liberar duplo clique em `INICIAR-SERVIDOR.bat` na pasta `controle-rcs-main`, ou  
> 3) Liberar download de ZIP do GitHub `moraesvmm/controle-rcs`  
> Não é necessário instalar Node, Git nem admin no Supabase para usuários finais.

---

## Checklist rápido

- [ ] Pasta extraída (ZIP ou cópia de rede)  
- [ ] Existe `index.html` e `js\env.runtime.js` na pasta  
- [ ] Servidor: `py -3 -m http.server 8080` **ou** acesso ao IP de outro PC  
- [ ] Navegador: `http://localhost:8080` ou `http://IP:8080`  
- [ ] Internet liberada para `*.supabase.co` (dados do CRUD)
