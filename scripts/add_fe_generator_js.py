import os
import re

app_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\js\app.js'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

fe_functions = """
// --- Frontend Generator UI ---
const renderDescricoesGeradorFE = (arr) => {
  const lista = document.getElementById('listaDescricoesGeradorFE');
  if (!lista) return;
  if (!arr || arr.length === 0) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
    return;
  }
  lista.innerHTML = arr.map((desc, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${String(desc).replace(/"/g, '&quot;')}</textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `).join('');
};
document.getElementById('btnNovaDescricaoGeradorFE')?.addEventListener('click', () => {
  const lista = document.getElementById('listaDescricoesGeradorFE');
  if (lista && lista.querySelector('p')) lista.innerHTML = '';
  lista?.insertAdjacentHTML('beforeend', `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `);
});

const renderMateriaisGeradorFE = (arr) => {
  const lista = document.getElementById('listaMateriaisGeradorFE');
  if (!lista) return;
  if (!arr || arr.length === 0) {
    lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material.</p>';
    return;
  }
  lista.innerHTML = arr.map((mat, idx) => `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="mat-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${String(mat).replace(/"/g, '&quot;')}</textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `).join('');
};
document.getElementById('btnNovoMaterialGeradorFE')?.addEventListener('click', () => {
  const lista = document.getElementById('listaMateriaisGeradorFE');
  if (lista && lista.querySelector('p')) lista.innerHTML = '';
  lista?.insertAdjacentHTML('beforeend', `
    <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
      <textarea class="mat-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
      <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
    </div>
  `);
});
// ------------------------------
"""

# Insert `fe_functions` just before `let editandoPreventivaFE = null;`
target_insert = "let editandoPreventivaFE = null;"
if fe_functions not in content:
    content = content.replace(target_insert, fe_functions + "\n" + target_insert)

# Now update the `abrirFormularioPreventivaFE` call to include renderMateriaisGeradorFE
# target logic around line 2172:
target_logic = """  $('#editAtivMaquinaFE').value = editandoPreventivaFE.maquina || '';
    const descArrFE = editandoPreventivaFE.atividades_descricoes?.length ? editandoPreventivaFE.atividades_descricoes : (editandoPreventivaFE.descricao ? [editandoPreventivaFE.descricao] : []);
    renderDescricoesGeradorFE(descArrFE);
  $('#editAtivDuracaoFE').value = editandoPreventivaFE.duracao_horas || '';"""

replacement_logic = """  $('#editAtivMaquinaFE').value = editandoPreventivaFE.maquina || '';
    const descArrFE = editandoPreventivaFE.atividades_descricoes?.length ? editandoPreventivaFE.atividades_descricoes : (editandoPreventivaFE.descricao ? [editandoPreventivaFE.descricao] : []);
    renderDescricoesGeradorFE(descArrFE);
    const matArrFE = Array.isArray(editandoPreventivaFE.material) ? editandoPreventivaFE.material : (editandoPreventivaFE.material ? [String(editandoPreventivaFE.material)] : []);
    renderMateriaisGeradorFE(matArrFE);
  $('#editAtivDuracaoFE').value = editandoPreventivaFE.duracao_horas || '';"""

if target_logic in content:
    content = content.replace(target_logic, replacement_logic)

# Update submit logic in formEditarAtividadeFE
target_submit = """$('#formEditarAtividadeFE')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
    const descricao = descricoes[0] || '';
  const payload = {"""

replacement_submit = """$('#formEditarAtividadeFE')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
  const materiais = Array.from(document.querySelectorAll('.mat-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
  const descricao = descricoes[0] || '';
  const payload = {"""

if target_submit in content:
    content = content.replace(target_submit, replacement_submit)

# Also update the payload to save material
target_payload = """    atividades_descricoes: descricoes,
    duracao_horas: parseFloat($('#editAtivDuracaoFE').value) || 0,"""

replacement_payload = """    atividades_descricoes: descricoes,
    material: materiais,
    duracao_horas: parseFloat($('#editAtivDuracaoFE').value) || 0,"""

if target_payload in content:
    content = content.replace(target_payload, replacement_payload)


with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("FE Generator JS updated successfully.")
