import { GROQ_API_KEY } from './keys.js?v=1';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

let conversationHistory = [];

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

function getSystemPrompt() {
  return `Você é o Copiloto do Controller da Ball Beverage, especialista em gestão de custos de manutenção industrial.
Responda em português, de forma CURTA e DIRETA (máximo 4 frases). Seja objetivo e prático.
NUNCA invente dados. Se não souber, use a ferramenta "consultar_ordens" para descobrir.

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
