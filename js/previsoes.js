// js/previsoes.js
import { getClient } from './db.js?v=13';
import { showAITooltip } from './ai_tooltip.js';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = (v) => {
  const abs = Math.abs(v);
  return abs >= 1e6
    ? (v / 1e6).toFixed(2).replace('.', ',') + 'M'
    : abs >= 1000
    ? (v / 1000).toFixed(0) + 'k'
    : fmt(v);
};

function horasDesde(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h === 0) return `${m}min atrás`;
  if (h < 24) return `${h}h ${m}min atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function badgeFrescor(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const h = diff / 3_600_000;
  if (h < 4)  return { cor: '#3cff78', icone: '🟢', label: 'Dados frescos' };
  if (h < 12) return { cor: '#facc15', icone: '🟡', label: 'Dados recentes' };
  return { cor: '#ff3c3c', icone: '🔴', label: 'Dados desatualizados' };
}

function confiancaBar(pct) {
  const cor = pct >= 75 ? '#3cff78' : pct >= 50 ? '#facc15' : '#ff7043';
  return `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.5rem;">
      <div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${cor};border-radius:4px;transition:width 0.6s;"></div>
      </div>
      <span style="font-size:0.8rem;font-weight:700;color:${cor};min-width:36px;">${pct}%</span>
    </div>`;
}

// ─── render principal ────────────────────────────────────────────────────────
export async function renderPrevisoes() {
  const container = document.getElementById('previsoes-container');
  if (!container) return;

  container.innerHTML = '<p style="color:#888;">Carregando modelo preditivo da nuvem...</p>';

  try {
    const supabase = getClient();
    const { data: allData, error } = await supabase
      .from('custo_geral')
      .select('it_codigo, descricao_codigo')
      .ilike('it_codigo', 'FORECAST_METADATA%');

    if (error) throw error;
    if (!allData || allData.length === 0) {
      container.innerHTML = '<p style="color:#facc15; padding: 1rem;">O modelo preditivo não foi encontrado. Clique em "Recalcular Modelo" ou aguarde a rotina noturna.</p>';
      return;
    }

    // Ordenar histórico do mais recente pro mais antigo, mantendo o atual no topo se não houver histórico específico
    let mainData = allData.find(x => x.it_codigo === 'FORECAST_METADATA');
    if (!mainData) mainData = allData[0];
    
    window._allForecastMetadata = allData;
    renderPrevisoesUI(mainData.descricao_codigo, mainData.it_codigo, allData);

  } catch (err) {
    console.error('Erro ao carregar projeções', err);
    container.innerHTML = `<p style="color:#ff3c3c; padding: 1rem;">Erro ao carregar modelo preditivo.</p>`;
  }
}

export function renderPrevisoesUI(jsonString, selectedCode, allData) {
  const container = document.getElementById('previsoes-container');
  if (!container) return;

  try {
    const p = JSON.parse(jsonString);
    const isOverrun  = p.overrun > 0;
    const frescor    = badgeFrescor(p.atualizado_em);
    const horasAgo   = horasDesde(p.atualizado_em);

    // retrocompatível com payloads antigos
    const diasNoMes   = new Date(p.ano ?? new Date().getFullYear(), p.mes ?? new Date().getMonth() + 1, 0).getDate();
    const pMin        = p.projecao_min  ?? p.projecao_final;
    const pMax        = p.projecao_max  ?? p.projecao_final;
    const confianca   = p.confianca_pct ?? Math.max(30, Math.min(95, Math.round((p.dia_atual / diasNoMes) * 80 + 15)));
    const similaridade = p.twin_month_similaridade ?? 0;
    const vizinhos    = p.knn_vizinhos  ?? [];
    const alerts      = p.alerts        ?? [];


    // ── vizinhos KNN ──────────────────────────────────────────────────────
    const vizinhosHtml = vizinhos.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.75rem;">
           ${vizinhos.map((v, i) => `
             <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1rem;
                         background:rgba(255,255,255,0.03);border-radius:6px;
                         border:1px solid ${i === 0 ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.06)'};">
               <span style="font-size:0.75rem;font-weight:700;color:var(--muted);min-width:20px;">#${i+1}</span>
               <span style="flex:1;font-size:0.85rem;color:var(--text);">${v.month}</span>
               <span style="font-size:0.78rem;color:var(--muted);">R$ ${fmtK(v.proj)}</span>
               <span style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:12px;
                            background:rgba(255,215,0,0.1);color:#facc15;">${v.similaridade}%</span>
             </div>`).join('')}
         </div>`
      : '';

    const temRange = pMin !== pMax;
    
    let dropdownHtml = '';
    if (allData && allData.length > 0) {
      let options = allData.map(d => {
        const isCurrent = d.it_codigo === 'FORECAST_METADATA';
        const label = isCurrent ? 'Mês Atual (Em andamento)' : d.it_codigo.replace('FORECAST_METADATA_', '');
        const sel = (d.it_codigo === selectedCode) ? 'selected' : '';
        return `<option value="${d.it_codigo}" ${sel}>${label}</option>`;
      }).join('');
      
      dropdownHtml = `
        <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom: -0.5rem; width:100%;">
          <select id="forecast-history-select" style="padding:0.4rem 0.8rem; border-radius:4px; background:var(--surface); color:var(--text); border:1px solid rgba(255,255,255,0.1); cursor:pointer; font-size:0.9rem;">
            ${options}
          </select>
        </div>
      `;
    }

    const html = `
      <div style="display:flex;flex-direction:column;gap:1.5rem;width:100%;">
        ${dropdownHtml}
        <!-- ① Alerta principal -->
        <div style="padding:1.5rem;border-radius:10px;
                    background:${isOverrun ? 'rgba(255,60,60,0.08)' : 'rgba(60,255,120,0.08)'};
                    border:1px solid ${isOverrun ? '#ff3c3c' : '#3cff78'};">
          <div style="display:flex;align-items:flex-start;gap:1rem;">
            <div style="font-size:2rem;padding-top:2px;">${isOverrun ? '⚠️' : '✅'}</div>
            <div style="flex:1;">
              <h3 style="margin:0;color:${isOverrun ? '#ff3c3c' : '#3cff78'};font-size:1.2rem;">
                ${isOverrun ? 'Risco de Estouro de Budget' : 'Budget Saudável'}
              </h3>
              <p style="margin:0.5rem 0 0;color:var(--text);font-size:0.93rem;line-height:1.6;">
                No ritmo atual (dia <strong>${p.dia_atual}</strong>), o modelo projeta fechamento em
                <strong>R$ ${fmt(p.projecao_final)}</strong>
                — ${isOverrun ? 'estouro' : 'saldo'} de
                <strong>R$ ${fmt(Math.abs(p.overrun))}</strong>
                em relação ao target de R$ ${fmt(p.budget)}.
              </p>
              ${temRange ? `<p style="margin:0.4rem 0 0;color:var(--muted);font-size:0.82rem;">
                Range de incerteza: <strong style="color:var(--text);">R$ ${fmt(pMin)}</strong>
                até <strong style="color:var(--text);">R$ ${fmt(pMax)}</strong>
              </p>` : ''}
            </div>
          </div>
        </div>

        <!-- ③ KPIs -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem;">
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Gasto Atual (Dia ${p.dia_atual})
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:var(--text);">
              R$ ${fmtK(p.gasto_atual)}
            </p>
          </div>
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Budget Mensal
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:var(--gold);">
              R$ ${fmtK(p.budget)}
            </p>
          </div>
          <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);
                                    border:1px solid ${isOverrun ? '#ff3c3c' : 'transparent'};">
            <h4 style="margin:0;color:var(--muted);font-size:0.78rem;text-transform:uppercase;letter-spacing:.05em;">
              Projeção de Fechamento
            </h4>
            <p style="margin:0.5rem 0 0;font-size:1.45rem;font-weight:700;color:${isOverrun ? '#ff3c3c' : 'var(--text)'}">
              R$ ${fmtK(p.projecao_final)}
            </p>
            ${temRange ? `<p style="margin:0.35rem 0 0;font-size:0.75rem;color:var(--muted);">[${fmtK(pMin)} — ${fmtK(pMax)}]</p>` : ''}
          </div>
        </div>

        <!-- ④ Confiança do modelo -->
        <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
            <h4 style="margin:0;color:var(--text);font-size:0.95rem;">Confiança da Projeção</h4>
            <span style="font-size:0.78rem;color:var(--muted);">
              ${vizinhos.length || 3} meses históricos gêmeos — dia ${p.dia_atual}/${diasNoMes}
            </span>
          </div>
          ${confiancaBar(confianca)}
          <p style="margin:0.6rem 0 0;font-size:0.8rem;color:var(--muted);">
            ${confianca >= 80
              ? 'Alta confiança — a maior parte do mês já foi realizada. Projeção sólida.'
              : confianca >= 55
              ? 'Confiança moderada — meio de mês, dados ainda sendo consolidados.'
              : 'Baixa confiança — início de mês com poucos dados. Interprete com cautela.'}
          </p>
        </div>

        <!-- ⑤ Gráfico -->
        <div class="panel" style="padding:1.5rem;border-radius:8px;background:var(--surface);">
          <h4 style="margin:0 0 1rem;color:var(--text);font-size:1.05rem;">Curva de Sazonalidade &amp; Burn Rate</h4>
          ${(p.historico_dias && p.historico_dias.length > 0) ? `
          <div style="position:relative;height:300px;width:100%;">
            <canvas id="predictiveChart"></canvas>
          </div>
          ` : `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;width:100%;border-radius:8px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);">
            <span style="font-size:2rem;margin-bottom:0.5rem;opacity:0.5;">📈</span>
            <p style="color:var(--muted);font-size:0.9rem;text-align:center;line-height:1.5;max-width:80%;">
              Gráfico em construção.<br>Como acabamos de virar o mês, o modelo de Inteligência Artificial precisa de <strong>pelo menos 2 dias</strong> de consumo registrados no mês corrente para conseguir desenhar a curva matemática de sazonalidade.
            </p>
          </div>
          `}
        </div>

        <!-- ⑥ Mês Gêmeo -->
        <div class="panel" style="padding:1.4rem;border-radius:8px;background:var(--surface);">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
            <h4 style="margin:0;color:var(--text);font-size:0.95rem;">Mês Gêmeo - Inteligência Preditiva
              <button id="btnTooltipGemeo" title="Pedir explicação da IA" style="background:none;border:none;cursor:pointer;font-size:0.9rem;opacity:0.7;margin-left:0.3rem;vertical-align:middle;" onclick="window._tooltipGemeoClick && window._tooltipGemeoClick(event)">✨</button>
            </h4>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span style="font-size:0.8rem;color:var(--muted);">Melhor vizinho:</span>
              <span style="font-size:0.85rem;font-weight:700;padding:3px 12px;border-radius:20px;
                            background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.3);
                            color:#facc15;">${p.twin_month}</span>
              ${similaridade > 0 ? `<span style="font-size:0.8rem;font-weight:700;color:#facc15;">${similaridade}% sim.</span>` : ''}
            </div>
          </div>
          <p style="margin:0 0 0.75rem;font-size:0.83rem;color:var(--muted);line-height:1.5;">
            O modelo identificou os meses históricos mais parecidos com o comportamento atual
            (dia ${p.dia_atual}, R$ ${fmtK(p.gasto_atual)} acumulados, ${p.volume_ordens_atual} ordens).
            A projeção é uma <strong>média ponderada</strong> dos vizinhos pelo inverso da distância.
          </p>
          ${vizinhosHtml}
        </div>

        <!-- ⑦ Status rodapé -->
        <div class="panel" style="padding:1rem 1.4rem;border-radius:8px;background:var(--surface);
                                  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <p style="color:var(--muted);font-size:0.82rem;margin:0;">
            Modelo atualizado automaticamente via GitHub Actions (03h UTC diário).
          </p>
          <p style="color:var(--muted);font-size:0.82rem;margin:0;">
            Último cálculo: ${new Date(p.atualizado_em).toLocaleString('pt-BR')} (${horasAgo})
          </p>
        </div>

      </div>
    `;

    container.innerHTML = html;

    const selectEl = document.getElementById('forecast-history-select');
    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        const novoCodigo = e.target.value;
        const meta = allData.find(x => x.it_codigo === novoCodigo);
        if (meta) {
          renderPrevisoesUI(meta.descricao_codigo, meta.it_codigo, allData);
        }
      });
    }

    // ── Tooltip do card Mês Gêmeo ────────────────────────────────────────
    window._tooltipGemeoClick = (evt) => {
      const btn = document.getElementById('btnTooltipGemeo');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ctx3 = `Mês Gêmeo identificado: ${p.twin_month || 'N/A'} | Similaridade: ${p.twin_month_similaridade || 0}% | Fechamento histórico do Mês Gêmeo: R$ ${Number(vizinhos[0]?.proj || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})} | Gasto atual do mês corrente: R$ ${Number(p.gasto_atual||0).toLocaleString('pt-BR', {minimumFractionDigits:2})} | Projeção de fechamento: R$ ${Number(p.projecao_final||0).toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
      showAITooltip(rect.left, rect.bottom + 10, ctx3);
    };

    // ── gráfico ───────────────────────────────────────────────────────────
    if (p.historico_dias && p.historico_dias.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('predictiveChart')?.getContext('2d');
        if (!ctx) return;

        let cumulativeReal = 0;
        const labels        = [];
        const dataReal      = [];
        const dataProjected = [];
        const dataEvolucao  = [];
        const dataBandMin   = [];
        const dataBandMax   = [];

        const ultimoDia     = p.dia_atual;
        const projecaoFinal = p.projecao_final;

        let maxDia = ultimoDia;
        p.historico_dias.forEach(d => { if (d.dia > maxDia) maxDia = d.dia; });

        for (let i = 1; i <= maxDia; i++) {
          labels.push(`Dia ${i}`);
          const d = p.historico_dias.find(x => x.dia === i);

          if (!d || !d.is_projecao) {
            if (d) cumulativeReal += d.gasto_diario;
            dataReal.push(cumulativeReal);
            dataProjected.push(null);
            dataBandMin.push(null);
            dataBandMax.push(null);
          } else {
            dataReal.push(null);
            const frac = d.fracao_sazonal;
            dataProjected.push(projecaoFinal * frac);
            dataBandMin.push(pMin * frac);
            dataBandMax.push(pMax * frac);
          }
          
          if (p.evolucao_projecao) {
            const e = p.evolucao_projecao.find(x => x.dia === i);
            if (e) {
              dataEvolucao.push(e.projecao);
            } else if (dataEvolucao.length > 0 && i <= ultimoDia) {
              dataEvolucao.push(dataEvolucao[dataEvolucao.length - 1]);
            } else {
              dataEvolucao.push(null);
            }
          } else {
            dataEvolucao.push(null);
          }
        }

        // conectar no último ponto real
        if (ultimoDia > 0 && ultimoDia <= maxDia) {
          dataProjected[ultimoDia - 1] = dataReal[ultimoDia - 1];
          dataBandMin[ultimoDia - 1]   = dataReal[ultimoDia - 1];
          dataBandMax[ultimoDia - 1]   = dataReal[ultimoDia - 1];
        }

        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Consumo Real (Acumulado)',
                data: dataReal,
                borderColor: '#3cff78',
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                pointRadius: 2,
                tension: 0.2,
                order: 1
              },
              {
                label: 'Evolução da Previsão (Alvo)',
                data: dataEvolucao,
                borderColor: '#00d2ff',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [2, 2],
                pointRadius: 0,
                tension: 0.1,
                order: 2
              },
              {
                label: 'Projeção IA (Futuro)',
                data: dataProjected,
                borderColor: 'rgba(255,215,0,0.9)',
                backgroundColor: 'rgba(255,215,0,0.07)',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.3,
                order: 3
              },
              {
                label: 'Banda Máxima',
                data: dataBandMax,
                borderColor: 'rgba(255,120,60,0.35)',
                backgroundColor: 'rgba(255,120,60,0.05)',
                borderWidth: 1,
                borderDash: [3, 4],
                pointRadius: 0,
                fill: '+1',
                tension: 0.3,
                order: 4
              },
              {
                label: 'Banda Mínima',
                data: dataBandMin,
                borderColor: 'rgba(60,255,120,0.25)',
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderDash: [3, 4],
                pointRadius: 0,
                fill: false,
                tension: 0.3,
                order: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: (evt, elements, chart) => {
              if (!elements.length) return;
              const el = elements[0];
              const diaLabel = chart.data.labels[el.index];
              const valorReal = chart.data.datasets[0].data[el.index];
              const valorProj = chart.data.datasets[1].data[el.index];
              const fmt2 = v => v != null ? 'R$ ' + Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2}) : 'N/A';
              const ctx2 = `${diaLabel} do mês | Consumo real acumulado: ${fmt2(valorReal)} | Projeção IA acumulada: ${fmt2(valorProj)} | Budget mensal: R$ ${Number(p.budget||0).toLocaleString('pt-BR',{minimumFractionDigits:2})} | Estouro projetado: R$ ${Number(p.overrun||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`;
              showAITooltip(evt.native.clientX, evt.native.clientY + 20, ctx2);
            },
            plugins: {
              legend: {
                labels: {
                  color: '#ccc',
                  filter: (item) => !item.text.includes('Banda')
                }
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    if (ctx.raw == null) return null;
                    return ctx.dataset.label + ': R$ ' + fmt(ctx.raw);
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: '#888', maxTicksLimit: 10 },
                grid: { color: 'rgba(255,255,255,0.04)' }
              },
              y: {
                ticks: { color: '#888', callback: (v) => 'R$ ' + fmtK(v) },
                grid: { color: 'rgba(255,255,255,0.04)' }
              }
            }
          }
        });
      }, 100);
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color:#ff3c3c;">Erro ao carregar dados preditivos da nuvem.</p>';
  }
}
