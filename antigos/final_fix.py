with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

backend_funcs = """
  const renderDescricoesGerador = (arr) => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${desc.replace(/"/g, '&quot;')}</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `).join('');
  };
  document.getElementById('btnNovaDescricaoGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `);
  });

  const renderMateriaisGerador = (arr) => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${desc.replace(/"/g, '&quot;')}</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `).join('');
  };
  document.getElementById('btnNovoMaterialGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `);
  });

"""

content = content.replace("  window.abrirModalAtividadePlano = function (idx) {", backend_funcs + "  window.abrirModalAtividadePlano = function (idx) {")

old_abrir = "    $('#editAtivIdentificador').value = a.identificador || '';\n    $('#editAtivMaquina').value = ctx.maquina;\n    $('#editAtivDescricao').value = descricaoLinhas(a).join('\\n');\n    $('#editAtivMaterial').value = Array.isArray(a.material) ? a.material.join('\\n') : (a.material || '');"
new_abrir = "    $('#editAtivIdentificador').value = a.identificador || '';\n    $('#editAtivMaquina').value = ctx.maquina;\n    renderDescricoesGerador(a.atividades_descricoes && a.atividades_descricoes.length ? a.atividades_descricoes : descricaoLinhas(a));\n    const matArray = Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : []);\n    renderMateriaisGerador(matArray);"
content = content.replace(old_abrir, new_abrir)

old_salvar = "    const ctx = getPlanoContexto();\n    const descText = $('#editAtivDescricao').value.trim();\n    const descricoes = descText ? descText.split('\\n').map((l) => l.trim()).filter(Boolean) : [];"
new_salvar = "    const ctx = getPlanoContexto();\n    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador')).map(el => el.value.trim()).filter(Boolean);\n    const materiais = Array.from(document.querySelectorAll('.mat-input-gerador')).map(el => el.value.trim()).filter(Boolean);"
content = content.replace(old_salvar, new_salvar)

old_mat = "material: $('#editAtivMaterial').value.trim() ? $('#editAtivMaterial').value.trim().split('\\n').filter(Boolean) : [],"
new_mat = "material: materiais,"
content = content.replace(old_mat, new_mat)

frontend_funcs = """
  const renderDescricoesGeradorFE = (arr) => {
    const lista = document.getElementById('listaDescricoesGeradorFE');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">${desc.replace(/"/g, '&quot;')}</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `).join('');
  };
  document.getElementById('btnNovaDescricaoGeradorFE')?.addEventListener('click', () => {
    const lista = document.getElementById('listaDescricoesGeradorFE');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    `);
  });

"""

content = content.replace("  window.abrirFormularioPreventivaFE = function(id) {", frontend_funcs + "  window.abrirFormularioPreventivaFE = function(id) {")

import re

fe_abrir_regex = re.compile(r"\$\('#editAtivMaquinaFE'\)\.value = editandoPreventivaFE\.maquina \|\| '';\s*\$\('#editAtivDescricaoFE'\)\.value = \(editandoPreventivaFE\.atividades_descricoes\?\.\[0\] \|\| editandoPreventivaFE\.descricao \|\| ''\);", re.MULTILINE)
fe_abrir_new = "$('#editAtivMaquinaFE').value = editandoPreventivaFE.maquina || '';\n    const descArrFE = editandoPreventivaFE.atividades_descricoes?.length ? editandoPreventivaFE.atividades_descricoes : (editandoPreventivaFE.descricao ? [editandoPreventivaFE.descricao] : []);\n    renderDescricoesGeradorFE(descArrFE);"
content = fe_abrir_regex.sub(fe_abrir_new, content)

fe_salvar_regex = re.compile(r"const descricao = \$\('#editAtivDescricaoFE'\)\.value\.trim\(\);")
fe_salvar_new = "const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);\n    const descricao = descricoes[0] || '';"
content = fe_salvar_regex.sub(fe_salvar_new, content)

fe_ativ_regex = re.compile(r"atividades_descricoes:\s*descricao\s*\?\s*\[descricao\]\s*:\s*\[\],")
fe_ativ_new = "atividades_descricoes: descricoes,"
content = fe_ativ_regex.sub(fe_ativ_new, content)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done fix JS")
