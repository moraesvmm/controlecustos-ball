import os
import re

app_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\index.html'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """              <div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Descrições / Atividades</span>
                  <div id="listaDescricoesGeradorFE" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovaDescricaoGeradorFE" style="align-self:flex-start;">+ Adicionar descrição</button>
                </div>"""

replacement = """              <div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Descrições / Atividades</span>
                  <div id="listaDescricoesGeradorFE" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovaDescricaoGeradorFE" style="align-self:flex-start;">+ Adicionar descrição</button>
                </div>
                <div class="full" style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:0.75rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Materiais</span>
                  <div id="listaMateriaisGeradorFE" style="display:flex; flex-direction:column; gap:0.5rem;"></div>
                  <button type="button" class="btn btn-outline btn-sm" id="btnNovoMaterialGeradorFE" style="align-self:flex-start;">+ Adicionar material</button>
                </div>"""

if target in content:
    content = content.replace(target, replacement)
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Frontend material fields added successfully to index.html.")
else:
    print("Target string not found.")
