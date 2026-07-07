import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# BACKEND: Add functions for rendering
backend_funcs = '''
  const renderDescricoesGerador = (arr) => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">\</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    ).join('');
  };
  document.getElementById('btnNovaDescricaoGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaDescricoesGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    );
  });

  const renderMateriaisGerador = (arr) => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhum material.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">\</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    ).join('');
  };
  document.getElementById('btnNovoMaterialGerador')?.addEventListener('click', () => {
    const lista = document.getElementById('listaMateriaisGerador');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="mat-input-gerador" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    );
  });

'''

content = content.replace("  window.abrirModalAtividadePlano = function (idx) {", backend_funcs + "  window.abrirModalAtividadePlano = function (idx) {")

# Backend: update abrirModalAtividadePlano
abrir_be_old = '''    #editAtivIdentificador.value = a.identificador || '';
    #editAtivMaquina.value = ctx.maquina;
    #editAtivDescricao.value = descricaoLinhas(a).join('\\n');
    #editAtivMaterial.value = Array.isArray(a.material) ? a.material.join('\\n') : (a.material || '');'''

abrir_be_new = '''    #editAtivIdentificador.value = a.identificador || '';
    #editAtivMaquina.value = ctx.maquina;
    renderDescricoesGerador(a.atividades_descricoes && a.atividades_descricoes.length ? a.atividades_descricoes : descricaoLinhas(a));
    const matArray = Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : []);
    renderMateriaisGerador(matArray);'''

content = content.replace(abrir_be_old, abrir_be_new)

# Backend: update salvarModalAtividadePlano
salvar_be_old = '''    const ctx = getPlanoContexto();
    const descText = #editAtivDescricao.value.trim();
    const descricoes = descText ? descText.split('\\n').map((l) => l.trim()).filter(Boolean) : [];'''

salvar_be_new = '''    const ctx = getPlanoContexto();
    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador')).map(el => el.value.trim()).filter(Boolean);
    const materiais = Array.from(document.querySelectorAll('.mat-input-gerador')).map(el => el.value.trim()).filter(Boolean);'''

content = content.replace(salvar_be_old, salvar_be_new)

content = content.replace("material: #editAtivMaterial.value.trim() ? #editAtivMaterial.value.trim().split('\\n').filter(Boolean) : [],", "material: materiais,")


# FRONTEND: Add functions for rendering
frontend_funcs = '''
  const renderDescricoesGeradorFE = (arr) => {
    const lista = document.getElementById('listaDescricoesGeradorFE');
    if (!lista) return;
    if (!arr || arr.length === 0) {
      lista.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin:0.25rem 0;">Nenhuma descrição.</p>';
      return;
    }
    lista.innerHTML = arr.map((desc, idx) => 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;">\</textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    ).join('');
  };
  document.getElementById('btnNovaDescricaoGeradorFE')?.addEventListener('click', () => {
    const lista = document.getElementById('listaDescricoesGeradorFE');
    if (lista.querySelector('p')) lista.innerHTML = '';
    lista.insertAdjacentHTML('beforeend', 
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <textarea class="desc-input-gerador-fe" rows="2" style="flex:1;background:var(--surface,#1e2a45);color:var(--text,#f1f5f9);border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:6px;padding:0.5rem;font-family:'DM Sans',sans-serif;font-size:0.875rem;resize:vertical;"></textarea>
        <button type="button" class="btn-icon" onclick="this.parentElement.remove()" style="margin-top:0.25rem;opacity:0.7;" title="Remover">❌</button>
      </div>
    );
  });

'''

content = content.replace("  window.abrirFormularioPreventivaFE = function(id) {", frontend_funcs + "  window.abrirFormularioPreventivaFE = function(id) {")

# Frontend: update abrirFormularioPreventivaFE
abrir_fe_old = '''    #editAtivIdentificadorFE.value = editandoPreventivaFE.identificador || '';
    #editAtivMaquinaFE.value = editandoPreventivaFE.maquina || '';
    #editAtivDescricaoFE.value = (editandoPreventivaFE.atividades_descricoes?.[0] || 
editandoPreventivaFE.descricao || '');
    #editAtivDuracaoFE.value = editandoPreventivaFE.duracao_horas || '';'''

# In the actual file it might have \n in the middle of editAtivDescricaoFE assignment. Let's use regex.
content = re.sub(
    r"\$\('#editAtivIdentificadorFE'\)\.value.*?\$\('#editAtivDuracaoFE'\)\.value", 
    "#editAtivIdentificadorFE.value = editandoPreventivaFE.identificador || '';\n    #editAtivMaquinaFE.value = editandoPreventivaFE.maquina || '';\n    const descArrFE = editandoPreventivaFE.atividades_descricoes?.length ? editandoPreventivaFE.atividades_descricoes : (editandoPreventivaFE.descricao ? [editandoPreventivaFE.descricao] : []);\n    renderDescricoesGeradorFE(descArrFE);\n    #editAtivDuracaoFE.value", 
    content, 
    flags=re.DOTALL
)

# Frontend: update salvarFormularioPreventivaFE
salvar_fe_old = '''  const salvarFormularioPreventivaFE = async (e) => {
    e.preventDefault();
    if (!editandoPreventivaFE) return;
    
    const desc = #editAtivDescricaoFE.value.trim();'''

salvar_fe_new = '''  const salvarFormularioPreventivaFE = async (e) => {
    e.preventDefault();
    if (!editandoPreventivaFE) return;
    
    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
    const desc = descricoes[0] || '';'''

content = content.replace(salvar_fe_old, salvar_fe_new)

content = content.replace("atividades_descricoes: desc ? [desc] : [],", "atividades_descricoes: descricoes,")

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done app.js")
