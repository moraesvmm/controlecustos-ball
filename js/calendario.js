import { abrirDrilldown } from './drilldown.js?v=3';
import { calcularStatus } from './logic.js?v=9';

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let _registros = [];

const diasDaSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const mesesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function initCalendario(registros) {
  _registros = registros;
  
  const btnPrev = document.getElementById('btnCalPrev');
  const btnNext = document.getElementById('btnCalNext');
  
  // Remove listeners antigos para não duplicar se init() rodar várias vezes
  const newBtnPrev = btnPrev.cloneNode(true);
  const newBtnNext = btnNext.cloneNode(true);
  btnPrev.parentNode.replaceChild(newBtnPrev, btnPrev);
  btnNext.parentNode.replaceChild(newBtnNext, btnNext);

  newBtnPrev.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderCalendario();
  });

  newBtnNext.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendario();
  });

  renderCalendario();
}

export function updateCalendario(registros) {
  _registros = registros;
  renderCalendario();
}

function renderCalendario() {
  const grid = document.getElementById('calendarioGrid');
  const headerMes = document.getElementById('calendarioMesAno');
  if (!grid || !headerMes) return;

  headerMes.textContent = `${mesesNome[currentMonth]} ${currentYear}`;

  const primeiroDia = new Date(currentYear, currentMonth, 1).getDay();
  const diasNoMes = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Mapear itens por dia (considerando UTC issues, faremos fallback seguro pela string local)
  const itensPorDia = {};
  for (const r of _registros) {
    if (!r.previsao_entrega) continue;
    
    // Tratando a data string "YYYY-MM-DD"
    const [anoStr, mesStr, diaStr] = String(r.previsao_entrega).slice(0,10).split('-');
    if (parseInt(anoStr, 10) === currentYear && parseInt(mesStr, 10) === (currentMonth + 1)) {
      const dia = parseInt(diaStr, 10);
      if (!itensPorDia[dia]) itensPorDia[dia] = [];
      itensPorDia[dia].push(r);
    }
  }

  let html = '';
  // Cabeçalhos (Dom a Sáb)
  for (const d of diasDaSemana) {
    html += `<div class="cal-header">${d}</div>`;
  }

  // Células vazias iniciais
  for (let i = 0; i < primeiroDia; i++) {
    html += `<div class="cal-cell empty"></div>`;
  }

  // Dias do mês
  const hoje = new Date();
  const hojeDate = hoje.getDate();
  const hojeMonth = hoje.getMonth();
  const hojeYear = hoje.getFullYear();

  for (let dia = 1; dia <= diasNoMes; dia++) {
    const isToday = dia === hojeDate && currentMonth === hojeMonth && currentYear === hojeYear;
    const itens = itensPorDia[dia] || [];
    
    let chipsHtml = '';
    for (const item of itens) {
      const status = item.status || calcularStatus(item);
      const isEntregue = status === 'ENTREGUE';
      const atrasado = !isEntregue && new Date(currentYear, currentMonth, dia) < new Date(hoje.setHours(0,0,0,0));
      
      let cssClass = 'cal-chip';
      if (isEntregue) cssClass += ' chip-success';
      else if (atrasado) cssClass += ' chip-danger';
      else cssClass += ' chip-warning';

      const validItem = item.item && item.item !== 'Sem descrição' && item.item !== 'Sem descrio';
      const itemText = validItem ? item.item : (item.fornecedor ? item.fornecedor : `RC ${item.rc}`);
      const nomeItem = itemText.toUpperCase();
      chipsHtml += `<div class="${cssClass}" data-id="${item.id}" title="${nomeItem} (${status})">${nomeItem}</div>`;
    }

    html += `
      <div class="cal-cell ${isToday ? 'today' : ''}">
        <div class="cal-day-num">${dia}</div>
        <div class="cal-day-content">${chipsHtml}</div>
      </div>
    `;
  }

  grid.innerHTML = html;

  // Eventos de clique nas chips
  grid.querySelectorAll('.cal-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = chip.dataset.id;
      const r = _registros.find(x => x.id === id);
      if (r) {
        abrirDrilldown({
          titulo: r.item || `RC ${r.rc}`,
          subtitulo: `Previsto para ${r.previsao_entrega.slice(0,10).split('-').reverse().join('/')}`,
          registros: [r],
          meta: { insight: 'Status: ' + (r.status || calcularStatus(r)) }
        });
      }
    });
  });
}
