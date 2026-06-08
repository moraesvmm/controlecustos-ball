import { fmtMoeda, fmtData, badgeStatus, badgeCriticidade } from './ui.js?v=2';
import { calcularStatus, calcularDiasFora, calcularValorPrevisto, calcularValorRecebido, calcularMesOriginalAtraso, MESES_CURTOS } from './logic.js?v=9';

let onEditCallback = null;
let onSavePhotoCallback = null;

export function setDrilldownEditHandler(fn) {
  onEditCallback = fn;
}

export function setDrilldownPhotoHandler(fn) {
  onSavePhotoCallback = fn;
}

export function abrirDrilldown({ titulo, subtitulo, registros, meta = {} }) {
  const panel = document.getElementById('drillPanel');
  const overlay = document.getElementById('drillOverlay');
  if (!panel) return;

  const total = registros.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const totalPrev = registros.reduce((s, r) => s + (Number(r.valor_previsto) || 0), 0);
  const totalRec = registros.reduce((s, r) => s + (Number(r.valor_recebido) || 0), 0);
  const atrasados = registros.filter((r) => {
    if (r._diasAtraso) return true;
    const st = r.status || calcularStatus(r);
    if (st === 'ENTREGUE') return false;
    const pe = r.previsao_entrega;
    if (!pe) return false;
    return new Date(pe) < new Date();
  }).length;

  document.getElementById('drillTitulo').textContent = titulo;
  document.getElementById('drillSubtitulo').textContent = subtitulo || '';

  const stats = [
    { label: 'Registros', value: registros.length },
    { label: 'Valor total', value: fmtMoeda(total) },
    { label: 'Previsto', value: fmtMoeda(totalPrev) },
    { label: 'Recebido', value: fmtMoeda(totalRec) },
    { label: 'Atrasados', value: atrasados, warn: atrasados > 0 },
  ];

  document.getElementById('drillStats').innerHTML = stats
    .map(
      (s) => `
    <div class="drill-stat ${s.warn ? 'warn' : ''}">
      <span>${s.label}</span>
      <strong>${s.value}</strong>
    </div>`
    )
    .join('');

  if (meta.insight) {
    let insightHtml = `<p>${meta.insight}</p>`;
    if (meta.isSupplierSLA && window.fornecedoresContatosData) {
      const contato = window.fornecedoresContatosData.find(c => c.fornecedor_nome.toUpperCase() === meta.supplierName.toUpperCase());
      if (contato) {
        const itensText = registros.map(r => `RC: ${r.rc || '-'} / Item: ${r.item || '-'} / Atraso: ${r._diasAtraso} dias`).join('\n');
        const baseMsg = contato.mensagem_padrao || 'Olá, bom dia! Tudo bem?\n\nSegue abaixo itens para verificação de atraso.';
        const msg = `${baseMsg}\n\n*Itens em atraso:*\n${itensText}`;
        
        let actions = '<div style="margin-top: 10px; display: flex; gap: 10px;">';
        if (contato.email) {
          const mailto = `mailto:${encodeURIComponent(contato.email)}?subject=${encodeURIComponent('Cobrança de Atraso')}&body=${encodeURIComponent(msg)}`;
          actions += `<a href="${mailto}" target="_blank" class="btn btn-outline" style="border-color: #38bdf8; color: #38bdf8; font-size: 0.8rem; padding: 0.4rem 0.8rem;">📩 Enviar E-mail</a>`;
        }
        if (contato.telefone) {
          const fone = contato.telefone.replace(/\D/g, '');
          const wa = `https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`;
          actions += `<a href="${wa}" target="_blank" class="btn btn-outline" style="border-color: #10b981; color: #10b981; font-size: 0.8rem; padding: 0.4rem 0.8rem;">📱 Enviar WhatsApp</a>`;
        }
        actions += '</div>';
        
        if (contato.email || contato.telefone) {
          insightHtml += actions;
        } else {
          insightHtml += `<p style="font-size: 0.8rem; color: var(--gold); margin-top: 10px;">⚠️ Fornecedor cadastrado, mas sem e-mail ou telefone configurado.</p>`;
        }
      } else {
         insightHtml += `<p style="font-size: 0.8rem; color: var(--muted); margin-top: 10px;">💡 Dica: Configure os contatos deste fornecedor (Painel SLA) para cobrar em 1 clique.</p>`;
      }
    }
    document.getElementById('drillInsight').innerHTML = insightHtml;
    document.getElementById('drillInsight').style.display = 'block';
  } else {
    document.getElementById('drillInsight').style.display = 'none';
  }

  const lista = document.getElementById('drillLista');
  if (!registros.length) {
    lista.innerHTML = '<p class="empty">Nenhum registro neste recorte.</p>';
  } else {
    lista.innerHTML = registros
      .slice(0, 50)
      .map((r) => {
        const mesAtraso = calcularMesOriginalAtraso(r);
        const isAtrasado = !!mesAtraso;
        const atrasadoClass = isAtrasado ? ' drill-item--atrasado' : '';
        const atrasadoBadge = r._diasAtraso
          ? `<span class="badge-atraso" style="background: var(--danger); color: white;">🚨 ${r.data_recebimento ? 'Entregue com atraso de' : 'Atrasado há'} ${r._diasAtraso} dias</span>`
          : (isAtrasado ? `<span class="badge-atraso">🚨 Atrasado do mês ${mesAtraso}</span>` : '');

        const hasFoto = !!r.foto_url;
        const fotoHtml = `
        <div class="drill-item-foto" data-id="${r.id}">
          ${hasFoto
            ? `<img src="${r.foto_url}" alt="Foto RC ${r.rc || ''}" loading="lazy" class="drill-foto-img" />`
            : `<em class="drill-no-media">Nenhum registro de mídia</em>`
          }
          <div class="drill-foto-actions">
            <label class="btn-ghost btn-sm drill-foto-upload-label">
              📷 ${hasFoto ? 'Trocar' : 'Anexar'} foto
              <input type="file" accept="image/*" class="foto-input-hidden drill-foto-input" data-id="${r.id}" />
            </label>
            ${hasFoto ? `<button type="button" class="btn-ghost btn-sm btn-danger-text drill-foto-remove" data-id="${r.id}">Remover</button>` : ''}
          </div>
        </div>`;

        return `
      <article class="drill-item${atrasadoClass}" data-id="${r.id}">
        <div class="drill-item-head">
          <strong>${r.item || '—'}</strong>
          <div class="drill-item-badges">
            ${atrasadoBadge}
            ${badgeStatus(r.status || calcularStatus(r))}
          </div>
        </div>
        <div class="drill-item-meta">
          <span>${r.maquina_linha || `${r.maquina || ''} · ${r.linha || ''}`}</span>
          <span>${fmtMoeda(r.valor)}</span>
        </div>
        <div class="drill-item-detail">
          RC ${r.rc || '—'} · PO ${r.po || '—'} · ${r.fornecedor || '—'}
          ${r.previsao_entrega ? ` · Prev. ${fmtData(r.previsao_entrega)}` : ''}
          ${r.dias_fora != null ? ` · ${r.dias_fora}d fora` : calcularDiasFora(r) != null ? ` · ${calcularDiasFora(r)}d fora` : ''}
        </div>
        <div class="drill-item-actions">
          <button type="button" class="btn-ghost btn-drill-edit" data-id="${r.id}">✏️ Editar RC</button>
          <button type="button" class="btn-ghost btn-drill-rc" data-id="${r.id}">👁 Ver RC</button>
        </div>
        ${r.last_modified_by ? `
        <div class="drill-item-footer" style="margin-top: 0.75rem; font-size: 0.65rem; color: var(--muted); border-top: 1px dashed var(--border); padding-top: 0.5rem;">
          Última alteração por: <strong>${r.last_modified_by}</strong> em ${r.last_modified_at ? new Date(r.last_modified_at).toLocaleString('pt-BR') : '—'}
        </div>` : ''}
        ${fotoHtml}
      </article>`;
      })
      .join('');

    if (registros.length > 50) {
      lista.innerHTML += `<p class="drill-more">+ ${registros.length - 50} registros. Refine o filtro ou exporte CSV.</p>`;
    }

    lista.querySelectorAll('.btn-drill-edit, .btn-drill-rc').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (onEditCallback) onEditCallback(btn.dataset.id);
        fecharDrilldown();
      });
    });

    lista.querySelectorAll('.drill-foto-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          alert('Imagem muito grande. Máximo 2 MB.');
          e.target.value = '';
          return;
        }
        const id = input.dataset.id;
        const reader = new FileReader();
        reader.onload = () => {
          if (onSavePhotoCallback) {
            onSavePhotoCallback(id, reader.result);
          }
          const container = lista.querySelector(`.drill-item-foto[data-id="${id}"]`);
          if (container) {
            const existingImg = container.querySelector('.drill-foto-img');
            const placeholder = container.querySelector('.drill-no-media');
            if (existingImg) {
              existingImg.src = reader.result;
            } else {
              if (placeholder) placeholder.remove();
              const img = document.createElement('img');
              img.src = reader.result;
              img.alt = 'Foto RC';
              img.className = 'drill-foto-img';
              img.loading = 'lazy';
              container.prepend(img);
            }
            const actionsDiv = container.querySelector('.drill-foto-actions');
            if (actionsDiv && !actionsDiv.querySelector('.drill-foto-remove')) {
              const rmBtn = document.createElement('button');
              rmBtn.type = 'button';
              rmBtn.className = 'btn-ghost btn-sm btn-danger-text drill-foto-remove';
              rmBtn.dataset.id = id;
              rmBtn.textContent = 'Remover';
              rmBtn.addEventListener('click', () => handleRemovePhoto(id, lista));
              actionsDiv.appendChild(rmBtn);
            }
            const lbl = actionsDiv?.querySelector('.drill-foto-upload-label');
            if (lbl) lbl.childNodes[0].textContent = '📷 Trocar foto';
          }
        };
        reader.readAsDataURL(file);
      });
    });

    lista.querySelectorAll('.drill-foto-remove').forEach((btn) => {
      btn.addEventListener('click', () => handleRemovePhoto(btn.dataset.id, lista));
    });
  }

  overlay?.classList.add('open');
  panel.classList.add('open');
}

function handleRemovePhoto(id, lista) {
  if (onSavePhotoCallback) {
    onSavePhotoCallback(id, null);
  }
  const container = lista.querySelector(`.drill-item-foto[data-id="${id}"]`);
  if (container) {
    const img = container.querySelector('.drill-foto-img');
    if (img) img.remove();
    if (!container.querySelector('.drill-no-media')) {
      const em = document.createElement('em');
      em.className = 'drill-no-media';
      em.textContent = 'Nenhum registro de mídia';
      container.prepend(em);
    }
    const rmBtn = container.querySelector('.drill-foto-remove');
    if (rmBtn) rmBtn.remove();
    const lbl = container.querySelector('.drill-foto-upload-label');
    if (lbl) lbl.childNodes[0].textContent = '📷 Anexar foto';
  }
}

export function fecharDrilldown() {
  document.getElementById('drillPanel')?.classList.remove('open');
  document.getElementById('drillOverlay')?.classList.remove('open');
}

export function registrosPorClique(chartId, label, datasetLabel, registros) {
  if (chartId === 'status') {
    return registros.filter((r) => (r.status || '') === label);
  }
  if (chartId === 'mes-dataset') {
    const mes = String(label).toLowerCase().slice(0, 3);
    const mesesLower = MESES_CURTOS.map((m) => m.toLowerCase());

    if (datasetLabel === 'Valor Previsto') {
      const now = new Date();
      const nowMonth = now.getFullYear() * 12 + now.getMonth();
      const mesIdx = mesesLower.indexOf(mes);
      const isMesAtual = mesIdx === now.getMonth();

      return registros.filter((r) => {
        if (r.data_recebimento) return false;
        const pe = r.previsao_entrega;
        if (!pe) return false;
        const d = new Date(String(pe).slice(0, 10));
        const peMonth = d.getFullYear() * 12 + d.getMonth();

        if (isMesAtual) {
          return peMonth <= nowMonth;
        }
        return d.getMonth() === mesIdx;
      });
    }
    if (datasetLabel === 'Valor Recebido') {
      return registros.filter((r) => {
        if (calcularValorRecebido(r) == null) return false;
        const d = new Date(String(r.data_recebimento).slice(0, 10));
        return mesesLower[d.getMonth()] === mes;
      });
    }
  }
  if (chartId === 'maquina') {
    return registros.filter((r) => (r.maquina_linha || '') === label);
  }
  if (chartId === 'prazos') {
    return registros.filter((r) => {
      if (r.natureza !== datasetLabel) return false;
      if (r.data_recebimento) return false;
      const diasFora = r.dias_fora ?? calcularDiasFora(r);
      if (diasFora == null || diasFora < 0) return false;

      if (label === 'Em dias') return diasFora <= 35;
      if (label === 'Pendente de retorno') return diasFora > 35 && diasFora <= 75;
      if (label === 'Atrasado para retorno') return diasFora > 75;
      return false;
    });
  }
  return registros;
}
