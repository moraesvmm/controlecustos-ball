import { getClient } from './db.js';
import { toast } from './ui.js';

let dataMaquinas = [];
let dataAtividades = [];

export async function initPlanoMestre() {
  const container = document.getElementById('view-plano-mestre');
  if (!container) return;

  // Refresh global window trigger for when import completes
  window.atualizarPlanoMestreGlobal = async () => {
    await carregarDados();
    render();
  };

  await carregarDados();
  render();
}

async function carregarDados() {
  try {
    const supabase = getClient();
    const { data: maquinas, error: errMaq } = await supabase.from('plano_mestre_maquinas').select('*');
    if (errMaq) throw errMaq;
    
    const { data: atividades, error: errAtv } = await supabase.from('plano_mestre_atividades').select('*');
    if (errAtv) throw errAtv;

    dataMaquinas = maquinas || [];
    dataAtividades = atividades || [];
  } catch (error) {
    console.error('Erro ao carregar dados do plano mestre:', error);
    toast('Erro ao carregar plano mestre.', 'error');
  }
}

function render() {
  const container = document.getElementById('planoMestreContent');
  if (!container) return;

  if (dataMaquinas.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 3rem; color: var(--muted); border: 1px dashed var(--border); border-radius: 8px;">
        <h4 style="color: var(--text);">Nenhuma máquina cadastrada no Plano Mestre</h4>
        <p>Importe a planilha base para começar a gerenciar.</p>
      </div>`;
    return;
  }

  let html = `<div style="display: flex; flex-direction: column; gap: 1.5rem;">`;
  
  dataMaquinas.forEach(maq => {
    const atividades = dataAtividades.filter(a => a.maquina_id === maq.id);
    
    html += `
      <div class="panel-card" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
        <div style="padding: 1rem 1.5rem; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="margin: 0; color: var(--primary); font-size: 1.1rem;">${maq.tag} - ${maq.nome_maquina}</h4>
            <div style="font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem;">${maq.disciplina} | Linha: ${maq.linha || '-'}</div>
          </div>
          <div class="badge badge-info">${atividades.length} Atividades</div>
        </div>
        <div style="padding: 0;">
          <table class="table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
            <thead>
              <tr>
                <th style="padding: 0.8rem 1.5rem; text-align: left; width: 40%;">Sistema / Componente</th>
                <th style="padding: 0.8rem 1rem; text-align: left; width: 25%;">Ação Preventiva</th>
                <th style="padding: 0.8rem 1rem; text-align: center; width: 15%;">Estratégia</th>
                <th style="padding: 0.8rem 1rem; text-align: center; width: 10%;">H-H</th>
                <th style="padding: 0.8rem 1.5rem; text-align: center; width: 10%;">Frequência</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (atividades.length === 0) {
      html += `<tr><td colspan="5" style="text-align: center; padding: 1rem; color: var(--muted);">Sem atividades</td></tr>`;
    } else {
      atividades.forEach(atv => {
        // Formatar hierarquia para ficar com um breadcrumb bonitinho
        const parts = atv.hierarquia_sistema.split(' > ');
        const componente = parts.pop();
        const path = parts.join(' > ');

        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.8rem 1.5rem;">
              <div style="color: var(--muted); font-size: 0.75rem; margin-bottom: 0.2rem;">${path}</div>
              <div style="color: var(--text); font-weight: 500;">${componente}</div>
            </td>
            <td style="padding: 0.8rem 1rem; color: var(--text);">
               ${atv.o_que_fazer}
               ${atv.material ? `<div style="font-size: 0.75rem; color: var(--muted); margin-top:0.3rem;">📦 ${atv.material}</div>` : ''}
            </td>
            <td style="padding: 0.8rem 1rem; text-align: center;">
               <span class="badge" style="background: rgba(255,255,255,0.1);">${atv.estrategia || '-'}</span>
            </td>
            <td style="padding: 0.8rem 1rem; text-align: center; color: var(--muted);">${atv.hh ? atv.hh.toFixed(2) : '-'}</td>
            <td style="padding: 0.8rem 1.5rem; text-align: center;">
               <strong style="color: var(--secondary);">${atv.frequencia || '-'}</strong>
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  container.innerHTML = html;
}
