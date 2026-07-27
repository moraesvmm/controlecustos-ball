with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Backend abrirModalAtividadePlano
old_abrir = '''    #editAtivIdentificador.value = a.identificador || '';
    #editAtivMaquina.value = ctx.maquina;
    #editAtivDescricao.value = descricaoLinhas(a).join('\\n');
    #editAtivMaterial.value = Array.isArray(a.material) ? a.material.join('\\n') : (a.material || '');'''

new_abrir = '''    #editAtivIdentificador.value = a.identificador || '';
    #editAtivMaquina.value = ctx.maquina;
    renderDescricoesGerador(a.atividades_descricoes && a.atividades_descricoes.length ? a.atividades_descricoes : descricaoLinhas(a));
    const matArray = Array.isArray(a.material) ? a.material : (a.material ? [String(a.material)] : []);
    renderMateriaisGerador(matArray);'''

content = content.replace(old_abrir, new_abrir)

# 2. Backend salvarModalAtividadePlano
old_salvar = '''    const ctx = getPlanoContexto();
    const descText = #editAtivDescricao.value.trim();
    const descricoes = descText ? descText.split('\\n').map((l) => l.trim()).filter(Boolean) : [];'''

new_salvar = '''    const ctx = getPlanoContexto();
    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador')).map(el => el.value.trim()).filter(Boolean);
    const materiais = Array.from(document.querySelectorAll('.mat-input-gerador')).map(el => el.value.trim()).filter(Boolean);'''

content = content.replace(old_salvar, new_salvar)

old_mat = "material: #editAtivMaterial.value.trim() ? #editAtivMaterial.value.trim().split('\\n').filter(Boolean) : [],"
new_mat = "material: materiais,"
content = content.replace(old_mat, new_mat)

# 3. Frontend salvarFormularioPreventivaFE
old_salvar_fe = '''  const salvarFormularioPreventivaFE = async (e) => {
    e.preventDefault();
    if (!editandoPreventivaFE) return;
    
    const desc = #editAtivDescricaoFE.value.trim();'''

new_salvar_fe = '''  const salvarFormularioPreventivaFE = async (e) => {
    e.preventDefault();
    if (!editandoPreventivaFE) return;
    
    const descricoes = Array.from(document.querySelectorAll('.desc-input-gerador-fe')).map(el => el.value.trim()).filter(Boolean);
    const desc = descricoes[0] || '';'''

content = content.replace(old_salvar_fe, new_salvar_fe)

old_ativ_desc = "atividades_descricoes: desc ? [desc] : [],"
new_ativ_desc = "atividades_descricoes: descricoes,"
content = content.replace(old_ativ_desc, new_ativ_desc)

with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done app.js literals")
