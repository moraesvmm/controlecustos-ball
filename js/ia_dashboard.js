/**
 * ============================================================
 * MÓDULO: Inteligência Artificial — XGBoost Dashboard
 * Conecta os endpoints /api/ai/* ao painel "🤖 Inteligência IA"
 * ============================================================
 */

const NIVEL_COR = { ALTO: '#ef4444', MEDIO: '#f59e0b', BAIXO: '#10b981' };
const NIVEL_BG  = { ALTO: 'rgba(239,68,68,0.1)', MEDIO: 'rgba(245,158,11,0.1)', BAIXO: 'rgba(16,185,129,0.1)' };

// ─── Conteúdo dos Tooltips (armazenado em JS, não em HTML) ────────────────────
const TOOLTIPS = {
  engine: {
    titulo: '🤖 O que é a XGBoost Engine?',
    corpo: `
      <b>XGBoost (Extreme Gradient Boosting)</b> é um dos algoritmos de Machine Learning mais poderosos disponíveis hoje.
      Ele cria uma sequência de "árvores de decisão" onde cada nova árvore foca em corrigir os erros da anterior —
      resultando em previsões muito mais precisas que fórmulas matemáticas simples.<br><br>
      <b>📌 Importante:</b> Todos os modelos rodam <u>100% localmente</u> neste servidor.
      Nenhum dado da fábrica é enviado para a internet.<br><br>
      <b>🔄 Re-treino:</b> Os modelos são retreinados automaticamente toda vez que o servidor inicia,
      e podem ser forçados manualmente pelo botão "Re-treinar Modelos".
    `
  },
  m1_budget: {
    titulo: '💰 Budget Forecast — Como funciona?',
    corpo: `
      <b>Objetivo:</b> Prever o gasto total do mês corrente usando Machine Learning ao invés de fórmulas simples.<br><br>
      <b>Dados usados para treinar:</b><br>
      • Dia do mês atual (1–31)<br>
      • Custo acumulado até o momento<br>
      • Número de ordens abertas no mês<br>
      • Histórico do mês anterior<br><br>
      <b>O que ele entrega:</b><br>
      • Projeção em R$ do fechamento do mês<br>
      • Comparação com o Budget definido<br><br>
      <b>⚠️ Status atual:</b> Este modelo requer ao menos 2 meses completos de histórico financeiro para treinar.
      Conforme os dados acumulam mês a mês, a precisão aumenta significativamente.
    `
  },
  m2_quebras: {
    titulo: '⚡ Radar de Risco de Quebra — Como funciona?',
    corpo: `
      <b>Objetivo:</b> Identificar quais máquinas têm maior probabilidade de sofrer uma
      falha grave (parada superior a 60 minutos) nos próximos 7 dias.<br><br>
      <b>Dados usados para treinar:</b><br>
      • 16.841 registros históricos de paradas (Fev–Jul 2026)<br>
      • Número de falhas da máquina por semana<br>
      • Tempo total parado por semana<br>
      • Tendência das últimas 3 semanas (subindo ou caindo)<br>
      • Linha de produção da máquina<br><br>
      <b>Como ler o Score:</b><br>
      🔴 <b>ALTO (≥ 60%)</b> — Ação urgente recomendada. Acionar preventiva imediatamente.<br>
      🟡 <b>MÉDIO (30–59%)</b> — Monitorar e agendar inspeção na semana.<br>
      🟢 <b>BAIXO (&lt; 30%)</b> — Situação estável, sem ação imediata.<br><br>
      <b>📊 Acurácia atual:</b> ~83% — Treinado com dados reais do sistema.
    `
  },
  m3_anomalias: {
    titulo: '⚠️ Anomalias Financeiras — Como funciona?',
    corpo: `
      <b>Algoritmo:</b> Isolation Forest (Floresta de Isolamento) — especializado em detectar
      "pontos fora da curva" em conjuntos de dados sem precisar de exemplos rotulados de fraude.<br><br>
      <b>Como ele funciona:</b><br>
      O modelo aprende o padrão histórico de todos os lançamentos (valor por área, valor por material,
      combinações comuns). Quando um lançamento novo foge desse padrão, ele recebe uma flag de anomalia.<br><br>
      <b>Dados analisados:</b><br>
      • Valor do lançamento (custo de entrada e mês anterior)<br>
      • Área / Centro de Custo do registro<br>
      • Grupo do material solicitado<br>
      • Solicitante e Caráter da ordem<br><br>
      <b>O que indica uma anomalia?</b><br>
      • Valor muito acima ou abaixo do padrão histórico para aquela combinação<br>
      • Combinações incomuns (ex: Facilities com material de Ferramentaria de alto valor)<br>
      • Variações atípicas em relação ao mês anterior<br><br>
      <b>📌 Ação recomendada:</b> A IA não bloqueia nada — apenas sinaliza para revisão humana antes do fechamento.
    `
  },
  m4_spare: {
    titulo: '🔧 Previsão de Spare Parts — Como funciona?',
    corpo: `
      <b>Objetivo:</b> Prever quais máquinas provavelmente precisarão de peças de reposição nos
      próximos 14 dias, antecipando a compra antes que a quebra provoque uma parada de linha.<br><br>
      <b>Dados usados para treinar:</b><br>
      • Histórico de falhas mecânicas por semana por máquina<br>
      • Número de RCs de conserto abertas sem data de recebimento<br>
      • Tempo total de parada por componente mecânico<br>
      • Linha de produção associada<br><br>
      <b>Lógica por trás:</b> O modelo aprende que, quando uma máquina acumula muitas falhas mecânicas
      em semanas consecutivas E não tem RCs de compra de peça associadas, o risco de necessidade urgente dispara.<br><br>
      <b>Como usar na prática:</b><br>
      • <b>ALTA (≥ 60%):</b> Verificar estoque e antecipar abertura de RC de compra.<br>
      • <b>MÉDIA (20–59%):</b> Incluir na inspeção preventiva da semana.<br><br>
      <b>📊 Acurácia atual:</b> ~90% — O mais preciso dos 4 modelos.
    `
  },
  score_radar: {
    titulo: '📊 O que é o Score de Risco?',
    corpo: `
      O Score de Risco (0–100%) é a <b>probabilidade estimada</b> pelo XGBoost de a máquina
      sofrer uma falha grave (parada &gt; 60 minutos) nos próximos 7 dias.<br><br>
      <b>Como é calculado — o modelo combina simultaneamente:</b><br>
      • Quantas vezes a máquina parou esta semana<br>
      • Quanto tempo total ela ficou parada<br>
      • Se o tempo parado está crescendo semana a semana (tendência)<br>
      • O comportamento histórico da mesma máquina nos meses anteriores<br><br>
      <b>Exemplo real do sistema:</b> A Conificadora teve score 78.9% pois combina alta
      frequência de paradas mecânicas com tendência de crescimento nas últimas 3 semanas —
      exatamente o padrão que antecedeu quebras graves no histórico.
    `
  },
  score_anomalia: {
    titulo: '📊 O que é o Score de Anomalia?',
    corpo: `
      O Score de Anomalia (0–100%) indica o grau de suspeita do lançamento financeiro.<br><br>
      Um score <b>alto</b> significa que este registro é muito diferente do padrão histórico —
      seja pelo valor, pela combinação incomum de Área + Material, ou pela relação com o histórico do mês anterior.<br><br>
      <b>Faixas de ação recomendada:</b><br>
      🔴 <b>80–100%:</b> Investigar urgente. Contatar requisitante antes de aprovar.<br>
      🟡 <b>60–79%:</b> Solicitar justificativa formal ao requisitante.<br>
      🟢 <b>Abaixo de 60%:</b> Monitorar — provavelmente variação normal.<br><br>
      <b>📌 Lembre-se:</b> A IA não comete aprovações — ela apenas amplia a visibilidade
      sobre o que merece atenção humana antes do fechamento financeiro.
    `
  }
};

// ─── Modal de Tooltip (injetado uma vez no DOM) ───────────────────────────────
function injetarModalTooltip() {
  if (document.getElementById('modalTooltipIA')) return;

  const modal = document.createElement('div');
  modal.id = 'modalTooltipIA';
  modal.style.cssText = [
    'display:none', 'position:fixed', 'inset:0', 'z-index:99999',
    'background:rgba(0,0,0,0.65)', 'backdrop-filter:blur(6px)',
    'align-items:center', 'justify-content:center'
  ].join(';');

  modal.innerHTML = `
    <div id="modalTooltipIABox" style="
      background:var(--surface,#1e293b);
      border:1px solid rgba(212,175,55,0.4);
      border-radius:16px; padding:2rem;
      max-width:520px; width:90%;
      box-shadow:0 24px 64px rgba(0,0,0,0.6);
      position:relative;
    ">
      <button id="btnFecharTooltipIA" style="
        position:absolute; top:1rem; right:1rem;
        background:none; border:none;
        color:var(--text-secondary,#94a3b8);
        font-size:1.4rem; cursor:pointer; line-height:1; padding:0;
      ">✕</button>
      <h3 id="tooltipIATitulo" style="margin:0 0 1.25rem; color:var(--gold,#d4af37); font-size:1.05rem; padding-right:1.5rem;"></h3>
      <div id="tooltipIACorpo" style="
        color:var(--text-primary,#e2e8f0);
        font-size:0.875rem; line-height:1.8;
        overflow-y:auto; max-height:55vh;
      "></div>
    </div>
  `;

  document.body.appendChild(modal);

  const fechar = () => { modal.style.display = 'none'; };
  document.getElementById('btnFecharTooltipIA').addEventListener('click', fechar);
  modal.addEventListener('click', e => { if (e.target === modal) fechar(); });

  // Delegação de cliques em botões com data-ia-tooltip
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-ia-tooltip]');
    if (!btn) return;
    const chave = btn.getAttribute('data-ia-tooltip');
    const t = TOOLTIPS[chave];
    if (!t) return;
    document.getElementById('tooltipIATitulo').textContent = t.titulo;
    document.getElementById('tooltipIACorpo').innerHTML   = t.corpo;
    modal.style.display = 'flex';
  });
}

// ─── Fábrica de botão "?" ─────────────────────────────────────────────────────
function btnHelp(chave, size = 18) {
  return `<button type="button" data-ia-tooltip="${chave}"
    title="Clique para saber mais"
    style="
      background:none; border:1px solid rgba(255,255,255,0.18);
      color:var(--text-secondary); cursor:pointer;
      width:${size}px; height:${size}px; border-radius:50%;
      font-size:${Math.round(size * 0.6)}px; font-weight:700;
      display:inline-flex; align-items:center; justify-content:center;
      flex-shrink:0; transition:border-color .2s, color .2s;
      vertical-align:middle;
    "
    onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'"
    onmouseout="this.style.borderColor='rgba(255,255,255,0.18)';this.style.color='var(--text-secondary)'">?</button>`;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function initIA() {
  injetarModalTooltip();

  // Tooltip no header geral da engine
  const iaView = document.getElementById('kpi-view-ia');
  if (iaView) {
    const h2 = iaView.querySelector('h2');
    if (h2 && !h2.dataset.tooltipInjected) {
      h2.dataset.tooltipInjected = '1';
      h2.insertAdjacentHTML('beforeend', `&nbsp;${btnHelp('engine', 16)}`);
    }
  }

  // Botão de re-treino
  const btnRetreina = document.getElementById('btnRetreinaIA');
  if (btnRetreina && !btnRetreina._iaListenerAdded) {
    btnRetreina._iaListenerAdded = true;
    btnRetreina.addEventListener('click', async () => {
      btnRetreina.disabled = true;
      btnRetreina.textContent = '⏳ Retreinando (~35s)...';
      try {
        await fetch('/api/ai/treinar', { method: 'POST' });
        setTimeout(async () => {
          await carregarTodosModelos();
          btnRetreina.textContent = '✅ Concluído!';
          setTimeout(() => {
            btnRetreina.textContent = '🔄 Re-treinar Modelos';
            btnRetreina.disabled = false;
          }, 3000);
        }, 35000);
      } catch {
        btnRetreina.textContent = '❌ Erro';
        btnRetreina.disabled = false;
      }
    });
  }

  await carregarTodosModelos();
}

async function carregarTodosModelos() {
  await Promise.all([
    carregarStatus(),
    carregarBudget(),
    carregarRadarRisco(),
    carregarSpareParts(),
  ]);
}

// ─── Status dos Modelos ───────────────────────────────────────────────────────
async function carregarStatus() {
  const badge = document.getElementById('iaStatusBadge');
  const cards = document.getElementById('iaModelCards');
  if (!badge || !cards) return;

  try {
    const res  = await fetch('/api/ai/status');
    const data = await res.json();

    if (!data.disponivel) {
      badge.textContent = '❌ Engine indisponível';
      badge.style.color = '#ef4444';
      return;
    }

    const modelos   = data.modelos || {};
    const treinados = Object.values(modelos).filter(m => m.treinado).length;
    badge.textContent = `✅ ${treinados}/${Object.keys(modelos).length} modelos ativos`;
    badge.style.color = '#10b981';

    // Atualizar badge da aba
    const iaBadge = document.getElementById('iaBadge');
    if (iaBadge && (window._iaRadarCount || 0) > 0) {
      iaBadge.textContent = window._iaRadarCount;
      iaBadge.style.display = 'inline';
    }

    const META = {
      m1_budget    : { label: 'Budget Forecast',  icon: '💰', tipKey: 'm1_budget'    },
      m2_quebras   : { label: 'Radar de Quebras', icon: '⚡', tipKey: 'm2_quebras'   },
      m3_anomalias : { label: 'Anomalias',        icon: '⚠️', tipKey: 'm3_anomalias' },
      m4_spareparts: { label: 'Spare Parts',      icon: '🔧', tipKey: 'm4_spare'     },
    };

    cards.innerHTML = Object.entries(modelos).map(([key, m]) => {
      const meta = META[key] || { label: key, icon: '🤖', tipKey: 'engine' };
      const ok   = m.treinado;
      const acc  = m.acuracia      ? `${(m.acuracia * 100).toFixed(1)}%`
                 : m.pct_anomalias ? `${m.pct_anomalias}% anom.` : '—';
      const treino = m.treinado_em ? new Date(m.treinado_em).toLocaleString('pt-BR') : 'N/A';

      return `
        <div style="
          background:var(--bg2,#0f172a);
          border:1px solid ${ok ? 'rgba(16,185,129,0.35)' : 'var(--border)'};
          border-radius:10px; padding:1rem;
          display:flex; flex-direction:column; gap:0.4rem;
        ">
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span style="font-size:1.2rem;">${meta.icon}</span>
            <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary); flex:1;">${meta.label}</span>
            <span style="font-size:0.68rem; color:${ok ? '#10b981' : '#ef4444'}; font-weight:700;">${ok ? '● ATIVO' : '○ N/A'}</span>
            ${btnHelp(meta.tipKey, 15)}
          </div>
          ${ok
            ? `<div style="font-size:0.78rem;color:var(--text-secondary);">Precisão: <strong style="color:var(--gold);">${acc}</strong></div>
               <div style="font-size:0.7rem;color:var(--text-secondary);">Treino: ${treino}</div>`
            : `<div style="font-size:0.78rem;color:var(--text-secondary);">Dados insuficientes para treino.</div>`}
        </div>`;
    }).join('');

  } catch {
    if (badge) { badge.textContent = '❌ Servidor offline'; badge.style.color = '#ef4444'; }
  }
}

// ─── Radar de Risco (Modelo 2) ────────────────────────────────────────────────
async function carregarRadarRisco() {
  const el = document.getElementById('iaRadarRisco');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">Carregando...</div>';

  // Injetar tooltips nos headers das seções
  _addTooltipToHeader('iaBudgetForecast', ['m1_budget']);
  _addTooltipToHeader('iaRadarRisco', ['m2_quebras', 'score_radar']);

  try {
    const res  = await fetch('/api/ai/radar-risco');
    const data = await res.json();
    window._iaRadarCount = data.filter(d => d.nivel === 'ALTO').length;

    if (!data.length) {
      el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">Nenhum dado. Treine os modelos.</div>';
      return;
    }

    el.innerHTML = data.slice(0, 20).map(m => `
      <div style="
        display:flex; align-items:center; gap:0.75rem;
        padding:0.6rem 0.75rem; border-radius:8px;
        background:${NIVEL_BG[m.nivel]}; border-left:3px solid ${NIVEL_COR[m.nivel]};
      ">
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
               title="${m.maquina}">${m.maquina}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);">
            ${m.linha} · ${m.n_falhas} falha${m.n_falhas !== 1 ? 's' : ''} · ${m.tempo_total}min parada
          </div>
        </div>
        <div style="width:50px;flex-shrink:0;">
          <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${m.score}%;background:${NIVEL_COR[m.nivel]};border-radius:2px;"></div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;min-width:48px;">
          <div style="font-size:0.9rem;font-weight:700;color:${NIVEL_COR[m.nivel]};">${m.score}%</div>
          <div style="font-size:0.62rem;color:${NIVEL_COR[m.nivel]};font-weight:600;">${m.nivel}</div>
        </div>
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<div style="color:#ef4444;text-align:center;padding:1rem;">Erro ao carregar.</div>';
  }
}

// ─── Budget Forecast (Modelo 1) ───────────────────────────────────────────────
async function carregarBudget() {
  const el = document.getElementById('iaBudgetForecast');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">Carregando...</div>';

  try {
    const res  = await fetch('/api/ai/projecao-budget');
    const data = await res.json();

    if (!data || !data.sucesso) {
      el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">✅ Modelo inativo. ' + (data?.mensagem || 'Sem dados suficientes') + '</div>';
      return;
    }

    const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dif = data.projecao - data.gasto_atual;
    const difPct = data.gasto_atual > 0 ? (dif / data.gasto_atual) * 100 : 0;

    el.innerHTML = `
      <div style="display:flex; gap:1.5rem; flex-wrap:wrap; align-items:center;">
        <div style="flex:1; min-width:250px; padding:1.5rem; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:12px; text-align:center;">
          <div style="font-size:0.85rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">Projeção de Fechamento</div>
          <div style="font-size:2rem; font-weight:700; color:#3b82f6;">${fmt(data.projecao)}</div>
          <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.5rem;">
            Variação esperada de <span style="font-weight:600; color:${dif > 0 ? '#ef4444' : '#10b981'}">${dif > 0 ? '+' : ''}${fmt(dif)} (${difPct.toFixed(1)}%)</span>
          </div>
        </div>

        <div style="flex:2; min-width:300px;">
          <div style="display:flex; flex-direction:column; gap:1rem;">
            
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
              <div>
                <div style="font-size:0.75rem; color:var(--text-secondary);">Gasto Atual Realizado</div>
                <div style="font-size:1.25rem; font-weight:600; color:var(--text-primary);">${fmt(data.gasto_atual)}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:0.75rem; color:var(--text-secondary);">Ordens Emitidas</div>
                <div style="font-size:1.1rem; font-weight:600; color:var(--text-primary);">${data.n_ordens}</div>
              </div>
            </div>

            <!-- Progresso Visual -->
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-bottom:0.25rem;">
                <span>Progresso R$</span>
                <span>${((data.gasto_atual / Math.max(data.projecao, data.gasto_atual)) * 100).toFixed(1)}%</span>
              </div>
              <div style="height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; position:relative;">
                <div style="position:absolute; top:0; left:0; height:100%; width:${Math.min(100, (data.gasto_atual / data.projecao) * 100)}%; background:#3b82f6; border-radius:4px;"></div>
              </div>
            </div>

            <div style="font-size:0.75rem; color:var(--text-secondary);">
              <span style="display:inline-block; width:8px; height:8px; background:#3b82f6; border-radius:50%; margin-right:4px;"></span> XGBoost detectou aceleração de gastos baseada no dia ${data.dia_atual} com ${data.n_ordens} ordens abertas.
            </div>

          </div>
        </div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = '<div style="color:#ef4444;text-align:center;padding:1rem;">Erro ao carregar.</div>';
  }
}

// ─── Spare Parts (Modelo 4) ───────────────────────────────────────────────────
async function carregarSpareParts() {
  const el = document.getElementById('iaSpareParts');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">Carregando...</div>';

  _addTooltipToHeader('iaSpareParts', ['m4_spare']);

  try {
    const res  = await fetch('/api/ai/spare-parts');
    const data = await res.json();

    if (!data.length) {
      el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">✅ Nenhum risco detectado.</div>';
      return;
    }

    el.innerHTML = data.map(m => {
      const cor = m.prioridade === 'ALTA' ? '#ef4444' : '#f59e0b';
      const bg  = m.prioridade === 'ALTA' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
      return `
        <div style="
          display:flex; align-items:center; gap:0.75rem;
          padding:0.6rem 0.75rem; border-radius:8px;
          background:${bg}; border-left:3px solid ${cor};
        ">
          <div style="flex:1; min-width:0;">
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                 title="${m.maquina}">${m.maquina}</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);">
              ${m.linha} · ${m.n_falhas_mec} falha${m.n_falhas_mec !== 1 ? 's' : ''} mec. · ${m.n_rc_abertas} RC${m.n_rc_abertas !== 1 ? 's' : ''} abertas
            </div>
          </div>
          <div style="width:50px;flex-shrink:0;">
            <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${m.prob_pct}%;background:${cor};border-radius:2px;"></div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;min-width:52px;">
            <div style="font-size:0.9rem;font-weight:700;color:${cor};">${m.prob_pct}%</div>
            <div style="font-size:0.62rem;color:${cor};font-weight:600;">${m.prioridade}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch {
    el.innerHTML = '<div style="color:#ef4444;text-align:center;padding:1rem;">Erro ao carregar.</div>';
  }
}

// ─── Anomalias Financeiras (Modelo 3) ─────────────────────────────────────────
async function carregarAnomalias() {
  const el = document.getElementById('iaAnomalias');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">Carregando...</div>';

  _addTooltipToHeader('iaAnomalias', ['m3_anomalias']);

  try {
    const res  = await fetch('/api/ai/anomalias');
    const data = await res.json();

    if (!data.length) {
      el.innerHTML = '<div style="color:var(--text-secondary);text-align:center;padding:2rem;">✅ Nenhuma anomalia detectada nos lançamentos.</div>';
      return;
    }

    const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
        <thead>
          <tr style="background:var(--bg2,#0f172a);color:var(--text-secondary);text-transform:uppercase;font-size:0.68rem;letter-spacing:0.05em;">
            <th style="padding:0.6rem 0.75rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;">
              Score IA ${btnHelp('score_anomalia', 13)}
            </th>
            <th style="padding:0.6rem 0.75rem;text-align:left;border-bottom:1px solid var(--border);">Código</th>
            <th style="padding:0.6rem 0.75rem;text-align:left;border-bottom:1px solid var(--border);">Data</th>
            <th style="padding:0.6rem 0.75rem;text-align:left;border-bottom:1px solid var(--border);">Área</th>
            <th style="padding:0.6rem 0.75rem;text-align:right;border-bottom:1px solid var(--border);">Valor Entrada</th>
            <th style="padding:0.6rem 0.75rem;text-align:right;border-bottom:1px solid var(--border);">Mês Anterior</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(a => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
              <td style="padding:0.6rem 0.75rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <div style="flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:2px;min-width:36px;max-width:54px;overflow:hidden;">
                    <div style="height:100%;width:${a.anomalia_score}%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:2px;"></div>
                  </div>
                  <span style="font-weight:700;color:#f59e0b;font-size:0.8rem;">${a.anomalia_score}%</span>
                </div>
              </td>
              <td style="padding:0.6rem 0.75rem;color:var(--text-primary);font-weight:500;font-size:0.78rem;font-family:monospace;">${a.it_codigo || '—'}</td>
              <td style="padding:0.6rem 0.75rem;color:var(--text-secondary);font-size:0.78rem;">${a.dt_trans || ('Mês ' + a.mes)}</td>
              <td style="padding:0.6rem 0.75rem;color:var(--text-secondary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;" title="${a.area || ''}">${a.area || '—'}</td>
              <td style="padding:0.6rem 0.75rem;text-align:right;font-weight:600;color:#ef4444;">${fmt(a.custo_de_entrada)}</td>
              <td style="padding:0.6rem 0.75rem;text-align:right;color:var(--text-secondary);">${fmt(a.custo_mes_anterior)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="margin:0.75rem 0 0;font-size:0.72rem;color:var(--text-secondary);">
        ⚠️ Esta lista não bloqueia aprovações — serve como alerta para revisão humana antes do fechamento financeiro.
      </p>
    `;
  } catch {
    el.innerHTML = '<div style="color:#ef4444;text-align:center;padding:1rem;">Erro ao carregar.</div>';
  }
}

// ─── Utilitário: injeta botões ? nos h3 de cada seção ─────────────────────────
function _addTooltipToHeader(elId, tooltipKeys) {
  const el = document.getElementById(elId);
  if (!el) return;
  const box = el.closest('[style*="border-radius: 12px"]') || el.parentElement?.parentElement;
  if (!box) return;
  const h3 = box.querySelector('h3');
  if (!h3 || h3.dataset.iaTooltipInjected) return;
  h3.dataset.iaTooltipInjected = '1';
  tooltipKeys.forEach(k => {
    h3.insertAdjacentHTML('beforeend', `&nbsp;${btnHelp(k, 16)}`);
  });
}
