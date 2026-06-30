import { getClient } from './db.js?v=46';
import { GROQ_API_KEY } from './keys.js?v=1';
import { agregarRecebidosPrevistos } from './logic.js?v=9';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

let conversationHistory = [];
let contextoFinanceiro = null;
let isOpen = false;
let isThinking = false;

const tools = [
  {
    type: "function",
    function: {
      name: "consultar_ordens",
      description: "Busca ordens de compra/serviço locais no banco de dados e retorna agregações (soma/contagem) e as ordens mais relevantes.",
      parameters: {
        type: "object",
        properties: {
          termo_busca: { type: "string", description: "O termo a ser pesquisado (nome de setor, colaborador, material, etc). Deixe vazio se quiser ver as últimas ou maiores ordens gerais." },
          intencao: { type: "string", enum: ["relevancia", "ultima", "maior"], description: "Como ordenar/filtrar os resultados." }
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

  // Interpretar situação orçamentária de forma EXPLÍCITA
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

  let kpisStr = '';
  if (window._registrosGlobais && window._registrosGlobais.length > 0) {
    try {
      const kpis = agregarRecebidosPrevistos(window._registrosGlobais);
      kpisStr = `\n\n=== DASHBOARD: PREVISTO VS RECEBIDO POR MÊS ===\n`;
      kpis.forEach(m => {
        kpisStr += `Mês: ${m.mes} | Previsto (a receber no mês+): R$ ${fmt(m.previsto)} | Recebido: R$ ${fmt(m.recebido)}\n`;
      });
    } catch(e) {
      console.warn('Erro ao agregar KPIs para o AI', e);
    }
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

MÊS HISTÓRICO MAIS SIMILAR: ${p.twin_month || 'N/A'} (${p.twin_month_similaridade || 0}% de similaridade)
VOLUME DE ORDENS: ${p.volume_ordens_atual || 0} ordens abertas

ALERTAS ATIVOS: ${(p.alerts || []).join(' | ') || 'Nenhum alerta identificado.'}${kpisStr}
===========================================`;
}

function findRelevantOrders(texto) {
  if (!window._registrosGlobais || window._registrosGlobais.length === 0) return '';
  
  const query = texto.toLowerCase();
  let matches = [];
  let agregadoCount = 0;
  let agregadoTotal = 0;

  const mapRecord = r => {
    const req = r.requisitante || r.solicitante || '';
    const nome = r.nome_solicitante || '';
    const set = r.setor || r.area || '';
    const desc = r.descricao_servico || r.descricao_falha || r.item || '';
    const cc = r.centro_custo || r.cc || '';
    const val = Number(r.valor_total_brl || r.valor || 0);
    return { record: r, score: 0, req, nome, set, desc, val, cc };
  };

  const ignore = ['ultima', 'última', 'maior', 'cara', 'recente', 'o','a','os','as','de','do','da','dos','das','em','no','na','nos','nas','por','para','com','sem','qual','quem','onde','quando','que','e','ou','mas','ordem','setor','conta','requisitante','feita','pelo','pela', 'colaborador'];
  const words = query.replace(/[?,.!]/g, '').split(/\s+/).filter(w => w.length > 2 && !ignore.includes(w));
  
  let allMatches = window._registrosGlobais.map(mapRecord);

  // Filtrar primeiro pelas palavras
  if (words.length > 0) {
    allMatches.forEach(m => {
      const r = m.record;
      const searchable = `${r.numero_ordem || ''} ${m.req} ${m.nome} ${m.set} ${m.desc} ${r.conta || ''} ${m.cc} ${r.fornecedor || ''}`.toLowerCase();
      words.forEach(w => {
        if (searchable.includes(w)) m.score++;
      });
    });
    allMatches = allMatches.filter(m => m.score > 0);
  }

  if (allMatches.length === 0) return '';

  agregadoTotal = allMatches.reduce((acc, m) => acc + m.val, 0);
  agregadoCount = allMatches.length;

  // Ordenar conforme a intenção
  if (query.includes('última') || query.includes('ultima') || query.includes('recent')) {
    allMatches.sort((a, b) => {
      const dateA = new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime();
      const dateB = new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime();
      return dateB - dateA;
    });
  } else if (query.includes('maior') || query.includes('cara') || query.includes('caro')) {
    allMatches.sort((a, b) => b.val - a.val);
  } else {
    // Ordenar por relevância (score) se houver pesquisa
    if (words.length > 0) {
      allMatches.sort((a, b) => b.score - a.score);
    } else {
      // Se não houver intenção nem filtro, ordena pelas mais recentes
      allMatches.sort((a, b) => {
        const dateA = new Date(a.record.data_emissao || a.record.dt_trans || a.record.created_at || 0).getTime();
        const dateB = new Date(b.record.data_emissao || b.record.dt_trans || b.record.created_at || 0).getTime();
        return dateB - dateA;
      });
    }
  }

  matches = allMatches.slice(0, 5);

  if (matches.length === 0) return '';

  const fmt = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
  let result = `\n\n=== REGISTROS / RC'S DA BASE (CONTROLE GLOBAL) ===\n`;
  if (agregadoCount > 0) {
    result += `[ATENÇÃO] A busca encontrou ${agregadoCount} registros no total, somando um valor de R$ ${fmt(agregadoTotal)}.\n`;
    result += `Para não sobrecarregar sua memória, listei abaixo apenas os ${matches.length} mais relevantes:\n`;
  } else {
    result += `Estes são os registros/RCs/Ordens encontrados na base de dados que batem com o que o usuário pediu:\n`;
  }

  matches.forEach(m => {
    const r = m.record;
    const n = m.nome ? ` (${m.nome})` : '';
    const ident = r.item_id ? `ID / RC: ${r.item_id}` : `ID / RC: ${String(r.id).split('-')[0]}`;
    result += `- ${ident} | Ordem: ${r.numero_ordem || 'S/N'} | Requisitante: ${m.req}${n} | Setor: ${m.set} | Valor: R$ ${fmt(m.val)} | Descrição: ${m.desc}\n`;
  });
  result += `==============================================\n`;
  
  return result;
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
  return `Você é o Copiloto do Controller da Ball Beverage, especialista em gestão de custos de manutenção industrial.
Responda em português, de forma CURTA e DIRETA (máximo 4 frases). Seja objetivo e prático.
SEMPRE forneça uma resposta em texto para o usuário, nunca retorne vazio.
NUNCA invente dados. Se não souber, use a ferramenta "consultar_ordens" para descobrir.
NUNCA diga que estamos dentro do orçamento se o campo "SITUAÇÃO ATUAL" disser "JÁ ESTOURADO".

${buildContextStr()}`;
}

async function chamarGroq() {
  const reqBody = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: getSystemPrompt() },
      ...conversationHistory
    ],
    tools: tools,
    tool_choice: "auto",
    temperature: 0.2
  };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify(reqBody)
  });

  if (!res.ok) {
    console.error(await res.text());
    throw new Error('Groq offline ou chave inválida');
  }

  return await res.json();
}

async function enviarMensagem(texto) {
  if (!texto.trim() || isThinking) return;
  isThinking = true;

  addMsg(texto, 'user');
  conversationHistory.push({ role: 'user', content: texto });

  const chips = document.getElementById('copiloto-chips');
  if (chips) chips.style.display = 'none';

  const thinkingDiv = addMsg(`<div class="cop-thinking"><div class="cop-dot"></div><div class="cop-dot"></div><div class="cop-dot"></div></div>`, 'ai');

  try {
    let json = await chamarGroq();
    let msg = json.choices[0].message;

    // Se o modelo decidir chamar uma ferramenta
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      conversationHistory.push(msg); // O assistente chamou a ferramenta
      
      const tc = msg.tool_calls[0];
      const args = JSON.parse(tc.function.arguments);
      
      // Construir string de busca interna
      let buscaInterna = args.termo_busca || '';
      if (args.intencao === 'ultima') buscaInterna += ' ultima';
      if (args.intencao === 'maior') buscaInterna += ' maior';
      
      const dbResult = findRelevantOrders(buscaInterna);
      const conteudoFinal = dbResult ? dbResult : "Nenhum dado encontrado para esta busca.";

      // Devolver o resultado para o modelo
      conversationHistory.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: conteudoFinal
      });

      // Chamar o modelo de novo para ele formular a resposta final lendo os dados
      json = await chamarGroq();
      msg = json.choices[0].message;
    }

    const resposta = msg.content?.trim() || 'Não consegui processar sua pergunta.';
    conversationHistory.push({ role: 'assistant', content: resposta });
    
    if (thinkingDiv) thinkingDiv.innerHTML = resposta;
  } catch(e) {
    if (thinkingDiv) thinkingDiv.innerHTML = '⚠️ Erro ao comunicar com o servidor da Inteligência Artificial (Groq). Verifique a chave da API.';
  }

  isThinking = false;
  const msgs = document.getElementById('copiloto-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

export async function initCopiloto() {
  await carregarContexto();

  const fab = document.getElementById('copiloto-fab');
  const win = document.getElementById('copiloto-window');
  const closeBtn = document.getElementById('copiloto-close');
  const sendBtn = document.getElementById('copiloto-send');
  const textarea = document.getElementById('copiloto-input');

  if (!fab || !win) return;

  fab.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    fab.textContent = isOpen ? '×' : '🤖';
    fab.style.fontSize = isOpen ? '1.6rem' : '1.5rem';

    if (isOpen && document.getElementById('copiloto-messages').children.length === 0) {
      addMsg('Olá! Sou o Copiloto do Controller. Posso responder perguntas sobre os gastos do mês, projeções e ordens.', 'ai');
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('open');
    fab.textContent = '🤖';
    fab.style.fontSize = '1.5rem';
  });

  if (sendBtn) sendBtn.addEventListener('click', () => {
    const txt = textarea.value.trim();
    textarea.value = '';
    textarea.style.height = '40px';
    enviarMensagem(txt);
  });

  if (textarea) {
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const txt = textarea.value.trim();
        textarea.value = '';
        textarea.style.height = '40px';
        enviarMensagem(txt);
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
      `<button class="cop-chip" onclick="document.getElementById('copiloto-input').value='${s}';document.getElementById('copiloto-send').click()">${s}</button>`
    ).join('');
  }
}
