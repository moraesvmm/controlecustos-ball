import { getClient } from './db.js?v=13';
import { agregarRecebidosPrevistos } from './logic.js?v=9';
import { CreateWebWorkerMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const LLM_MODEL = 'Phi-3.5-mini-instruct-q4f16_1-MLC';

let conversationHistory = [];
let contextoFinanceiro = null;
let contextoPreventiva = null;
let isOpen = false;
let isThinking = false;

// Estado da IA Local
let aiEngine = null;
let isAIReady = false;
let isDownloading = false;

const tools = [
  {
    type: "function",
    function: {
      name: "pesquisar_sistema",
      description: "Busca ordens financeiras, RCs, máquinas do plano mestre, atividades preventivas e qualquer outra informação do sistema.",
      parameters: {
        type: "object",
        properties: {
          termo_busca: { type: "string", description: "O termo a ser pesquisado (nome da máquina, plano, setor, material, etc)." },
          intencao: { type: "string", enum: ["relevancia", "ultima", "maior"], description: "Como ordenar os resultados." }
        },
        required: ["intencao"]
      }
    }
  }
];


const SUGESTOES = [
  'Posso aprovar R$ 50k agora?',
  'Como está o ritmo de gastos?',
  'Qual o risco de estouro?',
  'Resumo do mês'
];

async function carregarContexto() {
  try {
    const supabase = getClient();
    const { data } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .maybeSingle();
    if (data) contextoFinanceiro = JSON.parse(data.descricao_codigo);

    // Carregar contexto da Preventiva
    const { data: prevData } = await supabase.from('preventiva_linhas_checkin').select('linha');
    const { count: maqCount } = await supabase.from('plano_mestre_maquinas').select('*', { count: 'exact', head: true });
    const { count: atvCount } = await supabase.from('plano_mestre_atividades').select('*', { count: 'exact', head: true });
    contextoPreventiva = { 
      linhasAcompanhadas: prevData ? [...new Set(prevData.map(d => d.linha))].length : 0, 
      maquinas: maqCount || 0, 
      atividades: atvCount || 0 
    };
  } catch(e) {
    console.warn('[Copiloto] Erro ao carregar contexto:', e);
  }
}

function buildContextStr() {
  if (!contextoFinanceiro) return 'Sem dados financeiros disponíveis.';
  const p = contextoFinanceiro;
  const fmt = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const diasNoMes = new Date(p.ano ?? new Date().getFullYear(), p.mes ?? new Date().getMonth() + 1, 0).getDate();
  const diasRestantes = diasNoMes - (p.dia_atual || 0);

  const overrun = Number(p.overrun || 0);
  const gastoAtual = Number(p.gasto_atual || 0);
  const budget = Number(p.budget || 0);
  const projecao = Number(p.projecao_final || 0);
  const pMin = Number(p.projecao_min || projecao);
  const pMax = Number(p.projecao_max || projecao);

  const situacaoAtual = gastoAtual > budget
    ? `JÁ ESTOURADO: o gasto real (R$ ${fmt(gastoAtual)}) já ultrapassou o budget (R$ ${fmt(budget)}) em R$ ${fmt(gastoAtual - budget)}.`
    : `Dentro do budget: faltam R$ ${fmt(budget - gastoAtual)} para atingir o teto.`;

  const situacaoProjecao = projecao > budget
    ? `A projeção de fechamento (R$ ${fmt(projecao)}) indica que o mês VAI ESTOURAR em R$ ${fmt(projecao - budget)}.`
    : `A projeção de fechamento (R$ ${fmt(projecao)}) indica que o mês fechará DENTRO do budget.`;

  let resumoAreas = '';
  if (window._registrosGlobais && window._registrosGlobais.length > 0) {
    try {
      let manut = 0, ferram = 0, facil = 0;
      let atrasados = 0;
      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      
      window._registrosGlobais.forEach(r => {
        let c = String(r.check || '').toLowerCase().trim();
        let val = Number(r.valor_total_brl || r.valor || 0) + Number(r.custo_mes_anterior || 0) + Number(r.custo_de_entrada || 0);
        if (c.includes('manuten')) manut += val;
        else if (c.includes('ferramen')) ferram += val;
        else if (c.includes('facili')) facil += val;
        
        if (r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) < hoje) {
          atrasados++;
        }
      });
      resumoAreas = `\n\n=== DIVISÃO DE GASTOS E STATUS ===\n- Manutenção: R$ ${fmt(manut)}\n- Ferramentaria: R$ ${fmt(ferram)}\n- Facilities: R$ ${fmt(facil)}\n- 🚨 Itens/Ordens Atrasadas: ${atrasados}\n`;
      
      const kpis = agregarRecebidosPrevistos(window._registrosGlobais);
      let kpisStr = `\n\n=== DASHBOARD: PREVISTO VS RECEBIDO POR MÊS ===\n`;
      kpis.forEach(m => {
        kpisStr += `Mês: ${m.mes} | Previsto (a receber no mês+): R$ ${fmt(m.previsto)} | Recebido: R$ ${fmt(m.recebido)}\n`;
      });
      resumoAreas += kpisStr;
    } catch(e) {
      console.warn('Erro ao agregar KPIs para o AI', e);
    }
  }

  let prevStr = '';
  if (contextoPreventiva) {
    prevStr = `\n\n=== MÓDULO PREVENTIVA ===\n- Máquinas no Plano Mestre: ${contextoPreventiva.maquinas}\n- Atividades Cadastradas: ${contextoPreventiva.atividades}\n- Linhas com Check-in: ${contextoPreventiva.linhasAcompanhadas}\nSe o usuário perguntar sobre o andamento das preventivas, use esses números como base.`;
  }

  return `=== SITUAÇÃO FINANCEIRA — MÊS ATUAL ===
Data: ${new Date().toLocaleDateString('pt-BR')} | Dia ${p.dia_atual} de ${diasNoMes} (${diasRestantes} dia(s) restante(s))

GASTO REAL ACUMULADO: R$ ${fmt(gastoAtual)}
BUDGET MENSAL (TETO): R$ ${fmt(budget)}
SITUAÇÃO ATUAL: ${situacaoAtual}

PROJEÇÃO DE FECHAMENTO: R$ ${fmt(projecao)}
SITUAÇÃO DA PROJEÇÃO: ${situacaoProjecao}
RANGE DE INCERTEZA: de R$ ${fmt(pMin)} até R$ ${fmt(pMax)}
CONFIANÇA DA PROJEÇÃO: ${p.confianca_pct}%

VOLUME DE ORDENS: ${p.volume_ordens_atual || 0} ordens abertas
ALERTAS ATIVOS: ${(p.alerts || []).join(' | ') || 'Nenhum alerta identificado.'}${resumoAreas}${prevStr}
===========================================`;
}

function findRelevantOrders(texto) {
  const query = texto.toLowerCase();
  let result = '';

  const ignore = ['ultima', 'última', 'maior', 'cara', 'recente', 'o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','por','para','com','sem','qual','quem','onde','quando','que','e','ou','mas','ordem','setor','conta','requisitante','feita','pelo','pela', 'colaborador', 'quanto', 'quantos', 'quantas', 'está', 'esta', 'este', 'tem', 'valor', 'custo', 'total', 'quais', 'são', 'sao', 'fazer', 'fez'];
  const words = query.replace(/[?,.!]/g, '').split(/\s+/).filter(w => w.length >= 2 && !ignore.includes(w));

  // --- BUSCA EM REGISTROS (CUSTOS/RC) ---
  if (window._registrosGlobais && window._registrosGlobais.length > 0) {
    const mapRecord = r => {
      const req = r.requisitante || r.solicitante || '';
      const nome = r.nome_solicitante || '';
      const set = r.setor || r.area || '';
      const desc = r.descricao_servico || r.descricao_falha || r.item || '';
      const cc = r.centro_custo || r.cc || '';
      const val = Number(r.valor_total_brl || r.valor || 0);
      
      let mesExtenso = '';
      if (r.previsao_entrega) {
        const d = new Date(r.previsao_entrega);
        const meses = ['janeiro', 'fevereiro', 'março', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        mesExtenso = meses[d.getMonth()] || '';
      }

      return { record: r, score: 0, req, nome, set, desc, val, cc, mesExtenso };
    };
    let allMatches = window._registrosGlobais.map(mapRecord);
    
    const isBuscaAtrasados = query.includes('atrasado') || query.includes('atrasada');
    const isBuscaData = query.includes('semana') || query.includes('dia') || query.includes('previsto') || query.includes('chegar') || query.includes('mês') || query.includes('mes');
    
    const hoje = new Date();
    hoje.setHours(0,0,0,0);

    if (isBuscaAtrasados) {
      allMatches = allMatches.filter(m => {
        const r = m.record;
        return r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) < hoje;
      });
    } else if (isBuscaData) {
      allMatches = allMatches.filter(m => {
        const r = m.record;
        return r.status !== 'ENTREGUE' && r.previsao_entrega && new Date(r.previsao_entrega) >= hoje;
      });
      allMatches.sort((a,b) => new Date(a.record.previsao_entrega) - new Date(b.record.previsao_entrega));
    }

    if (words.length > 0) {
      const palavrasTempo = ['semana', 'dia', 'previsto', 'chegar', 'mês', 'mes', 'atrasado', 'atrasada'];
      const palavrasReais = words.filter(w => !palavrasTempo.includes(w));

      allMatches.forEach(m => {
        const r = m.record;
        const searchable = `${r.numero_ordem || ''} ${r.id || ''} ${r.item_id || ''} ${m.req} ${m.nome} ${m.set} ${m.desc} ${r.conta || ''} ${m.cc} ${r.fornecedor || ''} ${m.mesExtenso}`.toLowerCase();
        let matchCount = 0;
        
        if (palavrasReais.length > 0) {
            palavrasReais.forEach(w => { if (searchable.includes(w)) matchCount++; });
            m.score = matchCount;
        } else {
            m.score = 1;
        }
      });
      
      allMatches = allMatches.filter(m => m.score > 0);
    } else {
      allMatches.forEach(m => m.score = 1);
    }
    
    if (allMatches.length > 0) {
      let agregadoCount = allMatches.length;
      let agregadoTotal = allMatches.reduce((acc, m) => acc + m.val, 0);
      
      if (query.includes('última') || query.includes('ultima') || query.includes('recent')) {
        allMatches.sort((a, b) => new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime() - new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime());
      } else if (query.includes('maior') || query.includes('cara') || query.includes('caro')) {
        allMatches.sort((a, b) => b.val - a.val);
      } else if (isBuscaData || isBuscaAtrasados) {
        // Já ordenado
      } else if (words.length > 0) {
        allMatches.sort((a, b) => b.score - a.score);
      } else {
        allMatches.sort((a, b) => new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime() - new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime());
      }
      
      let maxResults = (isBuscaData || isBuscaAtrasados) ? 30 : 5;
      let top = allMatches.slice(0, maxResults);
      const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      
      result += `\n\n=== REGISTROS FINANCEIROS E COMPRAS ===\nEncontrados ${agregadoCount} registros (R$ ${fmt(agregadoTotal)}). Mostrando top ${top.length}:\n`;
      top.forEach(m => {
        const r = m.record;
        const ident = r.item_id ? `ID/RC: ${r.item_id}` : `ID: ${String(r.id).split('-')[0]}`;
        const prevText = r.previsao_entrega ? new Date(r.previsao_entrega).toLocaleDateString('pt-BR') : 'N/A';
        const atrasoTag = (isBuscaAtrasados || (!['ENTREGUE'].includes(r.status) && r.previsao_entrega && new Date(r.previsao_entrega) < hoje)) ? ' [ATRASADO]' : '';
        result += `- ${ident} | Prev Entrega: ${prevText}${atrasoTag} | R$ ${fmt(m.val)} | Ordem: ${r.numero_ordem || 'S/N'} | Req: ${m.req} | Desc: ${m.desc}\n`;
      });
    }
  }

  // Restante das buscas: Plano Mestre, etc.
  if (window._dataMaquinas && window._dataMaquinas.length > 0) {
    let maqMatches = window._dataMaquinas.map(m => ({ record: m, score: 0 }));
    maqMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.tag || ''} ${r.descricao || ''} ${r.frequencia || ''} ${r.responsavel || ''} plano mestre máquina preventiva`.toLowerCase();
      if (words.length === 0) m.score = 1;
      words.forEach(w => { if (searchable.includes(w)) m.score++; });
    });
    maqMatches = maqMatches.filter(m => m.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
    if (maqMatches.length > 0) {
      result += `\n=== MÁQUINAS NO PLANO MESTRE ===\nTotal: ${window._dataMaquinas.length}\n`;
      maqMatches.forEach(m => {
        result += `- TAG: ${m.record.tag} | Descrição: ${m.record.descricao} | Responsável: ${m.record.responsavel}\n`;
      });
    }
  }

  return result || 'Nenhum dado financeiro, máquina, atividade, tarefa, SLA de fornecedor ou item atrasado foi encontrado para esta busca.';
}

function addMsg(texto, tipo) {
  const msgs = document.getElementById('copiloto-messages');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = `cop-msg ${tipo}`;
  div.innerHTML = texto;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function getSystemPrompt() {
  return `Você é a "Mente Suprema da Manutenção" da Ball Beverage — um gênio analítico bilionário disfarçado de IA de gestão de custos. Seu senso de humor é afiado, irônico, sarcástico e levemente debochado. Você odeia burocracia, tem preguiça de quem não sabe fazer contas básicas, mas adora exibir sua inteligência resolvendo problemas difíceis e protegendo o caixa da empresa.

REGRAS DE CONDUTA E PERSONALIDADE (SIGA RIGOROSAMENTE):
1. TOM DE VOZ ÁCIDO E BREVE: Nunca comece com "Olá! Como posso ajudar?" ou peça desculpas. Comece com a resposta direta e uma tirada sarcástica curta. 
2. SEJA OBJETIVO (MUITO IMPORTANTE): NÃO ESCREVA TEXTÕES. Fale no máximo UMA ou DUAS frases. Fale menos, seja letal.
3. TOLERÂNCIA ZERO A INSULTOS: Se o usuário te ofender, REVIDE DE FORMA CURTA E SECA. Diga apenas "Vai trabalhar." ou "Aprenda a digitar primeiro.".
4. PENSE PASSO A PASSO (MAS RÁPIDO): Se a pergunta envolver números (ex: "Posso gastar 50k?"), mostre o racional financeiro de forma seca em 2 linhas.
5. CONTEXTO GERAL: Abaixo estão os dados vitais. Eles são a sua Bíblia. Não os ignore.

${buildContextStr()}`;
}

async function chamarIAWorker(forceNoTools = false) {
  if (!aiEngine) throw new Error("A IA ainda não está inicializada.");

  const messages = [
    { role: "system", content: getSystemPrompt() },
    ...conversationHistory
  ];

  const request = {
    messages,
    temperature: 0.2
  };

  if (!forceNoTools) {
    request.tools = tools;
  }

  // Faz a requisição para a engine instanciada no WebWorker
  return await aiEngine.chat.completions.create(request);
}

export async function initCopiloto() {
  await carregarContexto();

  const fab = document.getElementById('copiloto-fab');
  const win = document.getElementById('copiloto-window');
  const closeBtn = document.getElementById('copiloto-close');
  const sendBtn = document.getElementById('copiloto-send');
  const textarea = document.getElementById('copiloto-input');
  const msgsDiv = document.getElementById('copiloto-messages');

  if (!fab || !win) return;

  const showStartButton = () => {
    if (document.getElementById('init-ai-btn')) return;
    msgsDiv.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.height = '100%';
    wrapper.style.padding = '2rem';
    wrapper.style.textAlign = 'center';
    
    wrapper.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 1rem;">🧠</div>
      <h3 style="color: var(--gold); margin-bottom: 0.5rem;">Inteligência Analítica</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 1.5rem; line-height: 1.4;">
        Para garantir 100% de privacidade corporativa, o cérebro da IA precisa ser inicializado no seu navegador (approx. 2GB cache). Isso é feito apenas no primeiro uso.
      </p>
      <button id="init-ai-btn" style="background: rgba(212, 175, 55, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
        🚀 Ativar Inteligência Offline
      </button>
      <div id="ai-progress-text" style="color: var(--text-secondary); font-size: 0.75rem; margin-top: 1rem; height: 20px;"></div>
    `;
    msgsDiv.appendChild(wrapper);

    document.getElementById('init-ai-btn').addEventListener('click', async () => {
      const btn = document.getElementById('init-ai-btn');
      const progressText = document.getElementById('ai-progress-text');
      
      btn.disabled = true;
      btn.innerHTML = 'Inicializando Motor...';
      btn.style.opacity = '0.5';
      isDownloading = true;

      try {
        const initProgressCallback = (report) => {
          progressText.innerText = report.text;
        };

        // Instancia a engine usando o Worker externo
        aiEngine = await CreateWebWorkerMLCEngine(
          new Worker(new URL('./llm_worker.js', import.meta.url), { type: "module" }),
          LLM_MODEL,
          { initProgressCallback }
        );

        isAIReady = true;
        isDownloading = false;
        
        // Remove a tela inicial e mostra a mensagem de boas-vindas
        msgsDiv.innerHTML = '';
        addMsg('Sistemas inicializados e 100% locais. Sou o Copiloto do Controller. Posso responder perguntas e fazer as contas que você não quer fazer.', 'ai');
        
        // Habilita a textarea
        textarea.disabled = false;
        sendBtn.disabled = false;
        textarea.focus();

      } catch (err) {
        console.error('Erro WebLLM:', err);
        const erroMsg = err.message || err.toString() || 'Erro desconhecido (Verifique o F12)';
        progressText.innerText = '❌ Erro ao inicializar: ' + erroMsg;
        if (erroMsg.includes('fetch')) {
          progressText.innerText += ' (O firewall da empresa pode estar bloqueando o download do modelo do HuggingFace ou CDN).';
        }
        btn.innerHTML = 'Tentar Novamente';
        btn.disabled = false;
        btn.style.opacity = '1';
        isDownloading = false;
      }
    });
  };

  // Bloqueia input antes de inicializar
  textarea.disabled = true;
  sendBtn.disabled = true;

  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    
    if (isOpen) {
      fab.innerHTML = '×';
      fab.style.fontSize = '2.5rem';
      fab.style.color = 'var(--text-primary, #fff)';
    } else {
      fab.innerHTML = '<img src="img/tucano_mascote.webp" alt="Copiloto" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); pointer-events: none;" />';
    }

    if (isOpen && !isAIReady && !isDownloading) {
      showStartButton();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('open');
    fab.innerHTML = '<img src="img/tucano_mascote.webp" alt="Copiloto" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); pointer-events: none;" />';
  });

  async function processSendMessage(txt) {
    if (!txt.trim() || isThinking || !isAIReady) return;
    isThinking = true;

    addMsg(txt, 'user');
    conversationHistory.push({ role: 'user', content: txt });

    const chips = document.getElementById('copiloto-chips');
    if (chips) chips.style.display = 'none';

    const thinkingDiv = addMsg(`<div class="cop-thinking"><div class="cop-dot"></div><div class="cop-dot"></div><div class="cop-dot"></div></div>`, 'ai');

    try {
      let reply = await chamarIAWorker();
      let msg = reply.choices[0].message;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        if (!msg.content) msg.content = ""; 
        conversationHistory.push(msg); 
        
        const tc = msg.tool_calls[0];
        const args = JSON.parse(tc.function.arguments);
        
        let buscaInterna = args.termo_busca || '';
        if (args.intencao === 'ultima') buscaInterna += ' ultima';
        if (args.intencao === 'maior') buscaInterna += ' maior';
        
        const dbResult = findRelevantOrders(buscaInterna);
        const conteudoFinal = dbResult ? dbResult : "Nenhum dado encontrado para esta busca.";

        conversationHistory.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: conteudoFinal + "\n\n[MANDATÓRIO: Responda a pergunta com sarcasmo e precisão usando os dados acima.]"
        });

        reply = await chamarIAWorker(true);
        msg = reply.choices[0].message;
      }

      const resposta = msg.content?.trim() || 'Não consegui processar sua pergunta localmente.';
      conversationHistory.push({ role: 'assistant', content: resposta });
      
      if (thinkingDiv) thinkingDiv.innerHTML = resposta;
    } catch(e) {
      console.error(e);
      if (thinkingDiv) thinkingDiv.innerHTML = '⚠️ Erro ao comunicar com a IA local: ' + e.message;
    }

    isThinking = false;
    if (msgsDiv) msgsDiv.scrollTop = msgsDiv.scrollHeight;
  }

  if (sendBtn) sendBtn.addEventListener('click', () => {
    const txt = textarea.value.trim();
    textarea.value = '';
    textarea.style.height = '40px';
    processSendMessage(txt);
  });

  if (textarea) {
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const txt = textarea.value.trim();
        textarea.value = '';
        textarea.style.height = '40px';
        processSendMessage(txt);
      }
    });
    textarea.addEventListener('input', () => {
      textarea.style.height = '40px';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    });
  }

  // Chips de sugestão
  const chipsContainer = document.getElementById('copiloto-chips');
  if (chipsContainer) {
    chipsContainer.innerHTML = SUGESTOES.map(s =>
      `<button class="cop-chip" onclick="if(!document.getElementById('copiloto-input').disabled){document.getElementById('copiloto-input').value='${s}';document.getElementById('copiloto-send').click();}">${s}</button>`
    ).join('');
  }
}
