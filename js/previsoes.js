// js/previsoes.js
import { getClient } from './db.js?v=45';

export async function renderPrevisoes() {
  const container = document.getElementById('previsoes-container');
  if (!container) return;

  container.innerHTML = '<p style="color: #888;">Carregando modelo preditivo da nuvem...</p>';

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('custo_geral')
      .select('descricao_codigo')
      .eq('it_codigo', 'FORECAST_METADATA')
      .single();

    if (error) throw error;

    const mockPrediction = JSON.parse(data.descricao_codigo);
    const isOverrun = mockPrediction.overrun > 0;
    
    const html = `
      <div style="display: flex; flex-direction: column; gap: 1.5rem; max-width: 900px; margin: 0 auto; width: 100%;">
        
        <!-- Alerta Preditivo -->
        <div style="padding: 1.5rem; border-radius: 8px; background: ${isOverrun ? 'rgba(255, 60, 60, 0.1)' : 'rgba(60, 255, 120, 0.1)'}; border: 1px solid ${isOverrun ? '#ff3c3c' : '#3cff78'};">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="font-size: 2rem;">${isOverrun ? '⚠️' : '✅'}</div>
            <div>
              <h3 style="margin: 0; color: ${isOverrun ? '#ff3c3c' : '#3cff78'}; font-size: 1.25rem;">
                ${isOverrun ? 'Risco de Estouro de Budget' : 'Budget Saudável'}
              </h3>
              <p style="margin: 0.5rem 0 0 0; color: var(--text); font-size: 0.95rem;">
                No ritmo atual (dia ${mockPrediction.dia_atual}), a previsão matemática da nuvem projeta que fecharemos o mês gastando 
                <strong>R$ ${mockPrediction.projecao_final.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong>. 
                Isso representa um ${isOverrun ? 'estouro' : 'saldo'} de <strong>R$ ${Math.abs(mockPrediction.overrun).toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong> em relação ao target de R$ ${mockPrediction.budget.toLocaleString('pt-BR', {minimumFractionDigits:2})}.
              </p>
            </div>
          </div>
        </div>

        <!-- Métricas -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem;">
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Gasto Atual (Dia ${mockPrediction.dia_atual})</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: var(--text);">R$ ${mockPrediction.gasto_atual.toLocaleString('pt-BR')}</p>
          </div>
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Budget Mensal</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: var(--gold);">R$ ${mockPrediction.budget.toLocaleString('pt-BR')}</p>
          </div>
          <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface); border: 1px solid ${isOverrun ? '#ff3c3c' : 'transparent'};">
            <h4 style="margin: 0; color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Projeção de Fechamento</h4>
            <p style="margin: 0.5rem 0 0 0; font-size: 1.5rem; font-weight: bold; color: ${isOverrun ? '#ff3c3c' : 'var(--text)'};">R$ ${mockPrediction.projecao_final.toLocaleString('pt-BR')}</p>
          </div>
        </div>

        <!-- Gráfico de Predição (Machine Learning) -->
        <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
          <h4 style="margin: 0 0 1rem 0; color: var(--text); font-size: 1.1rem;">Curva de Sazonalidade & Burn Rate</h4>
          <canvas id="predictiveChart" height="100"></canvas>
        </div>

        <!-- Informação do Modelo -->
        <div class="panel" style="padding: 1.5rem; border-radius: 8px; background: var(--surface);">
          <h4 style="margin: 0 0 1rem 0; color: var(--text); font-size: 1.1rem;">Status do Modelo Automático</h4>
          <p style="color: var(--muted); font-size: 0.95rem; margin: 0;">O modelo roda automaticamente nas madrugadas (via GitHub Actions).</p>
          <p style="color: var(--gold); font-size: 0.85rem; margin-top: 0.5rem;">Último treinamento/cálculo: ${new Date(mockPrediction.atualizado_em).toLocaleString('pt-BR')}</p>
        </div>

      </div>
    `;

    container.innerHTML = html;

    // Renderizar o gráfico se houver histórico e projeção
    if (mockPrediction.historico_dias && mockPrediction.historico_dias.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('predictiveChart').getContext('2d');
        
        let cumulativeReal = 0;
        const labels = [];
        const dataReal = [];
        const dataProjected = [];
        
        const ultimoDia = mockPrediction.dia_atual;
        const projecaoFinal = mockPrediction.projecao_final;
        
        // Criar array unificado de 1 ao fim do mês
        let maxDia = ultimoDia;
        mockPrediction.historico_dias.forEach(d => {
          if (d.dia > maxDia) maxDia = d.dia;
        });

        for (let i = 1; i <= maxDia; i++) {
          labels.push(`Dia ${i}`);
          
          const d = mockPrediction.historico_dias.find(x => x.dia === i);
          
          if (!d || !d.is_projecao) {
            if (d) cumulativeReal += d.gasto_diario;
            dataReal.push(cumulativeReal);
            dataProjected.push(null);
          } else {
            // Projeção!
            dataReal.push(null);
            const estAcumulada = projecaoFinal * d.fracao_sazonal;
            dataProjected.push(estAcumulada);
          }
        }
        
        // Conectar as linhas: o último ponto real é o primeiro ponto da projeção
        if (dataReal.length > 0 && ultimoDia > 0 && ultimoDia <= maxDia) {
             dataProjected[ultimoDia - 1] = dataReal[ultimoDia - 1];
        }

        new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Consumo Real (Acumulado)',
                data: dataReal,
                borderColor: '#3cff78',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 2,
                tension: 0.2
              },
              {
                label: 'Projeção (Machine Learning)',
                data: dataProjected,
                borderColor: 'rgba(255, 215, 0, 0.8)', // Gold
                backgroundColor: 'rgba(255, 215, 0, 0.1)',
                borderWidth: 2,
                borderDash: [5, 5], // Linha tracejada
                pointRadius: 0,
                fill: true,
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            interaction: {
              mode: 'index',
              intersect: false,
            },
            plugins: {
              legend: {
                labels: { color: '#ccc' }
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    return ctx.dataset.label + ': R$ ' + Number(ctx.raw).toLocaleString('pt-BR', {minimumFractionDigits:2});
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: '#888' },
                grid: { color: 'rgba(255, 255, 255, 0.05)' }
              },
              y: {
                ticks: { 
                  color: '#888',
                  callback: (value) => 'R$ ' + (value/1000).toFixed(0) + 'k'
                },
                grid: { color: 'rgba(255, 255, 255, 0.05)' }
              }
            }
          }
        });
      }, 100);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="color: #ff3c3c;">Erro ao carregar dados preditivos da nuvem.</p>';
  }
}
