import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

backend_new = '''                <div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Descrições / Atividades</span>
                  <div id="listaDescricoesGerador" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovaDescricaoGerador" style="align-self:flex-start;">+ Adicionar descrição</button>
                </div>
                <div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Materiais</span>
                  <div id="listaMateriaisGerador" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovoMaterialGerador" style="align-self:flex-start;">+ Adicionar material</button>
                </div>'''
html = re.sub(r'<label class="full">\s*<span>Descri[^<]*</span>\s*<textarea id="editAtivDescricao"[^>]*></textarea>\s*</label>\s*<label class="full">\s*<span>Material</span>\s*<textarea id="editAtivMaterial"[^>]*></textarea>\s*</label>', backend_new, html)

fe_new = '''<div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Descrições / Atividades</span>
                  <div id="listaDescricoesGeradorFE" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovaDescricaoGeradorFE" style="align-self:flex-start;">+ Adicionar descrição</button>
                </div>'''
html = re.sub(r'<label class="full">\s*<span>Descri[^<]*</span>\s*<textarea id="editAtivDescricaoFE"[^>]*></textarea>\s*</label>', fe_new, html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
