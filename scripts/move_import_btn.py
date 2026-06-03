import os
import re

app_path = r'\\britufps01\group\Manutenção\25 - SISTEMA CONTROLE DE CUSTOS\controle-rc-system\index.html'

with open(app_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Target 1: Remove the old button section
target1 = """              <!-- Botão de Importação da Linha -->
              <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);">
                <p style="color: var(--muted); font-size: 0.85rem; margin-bottom: 0.75rem;">Atualizar dados desta linha com planilha Excel:</p>
                <input type="file" id="fileImportExcelPreventiva" accept=".xlsx, .xls" style="display: none;" />
                <button type="button" class="btn btn-outline" id="btnImportarPreventivaOnly" style="width: 100%; font-size: 0.85rem;">📥 Importar Planilha da Linha</button>
              </div>"""

content = content.replace(target1, "")

# Target 2: Insert the button at the top of step-mes
target2 = """        <!-- STEP 1: Seleção de Mês -->
        <div id="step-mes">
          <header style="text-align: center; margin-bottom: 2rem;">"""

replacement2 = """        <!-- STEP 1: Seleção de Mês -->
        <div id="step-mes" style="position: relative;">
          <div style="position: absolute; top: 0; right: 0;">
            <input type="file" id="fileImportExcelPreventiva" accept=".xlsx, .xls" style="display: none;" />
            <button type="button" class="btn btn-outline" id="btnImportarPreventivaOnly" style="font-size: 0.85rem; border-color: rgba(56,189,248,0.4); color: #38bdf8; display: flex; align-items: center; gap: 0.4rem;">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Importar Base
            </button>
          </div>
          <header style="text-align: center; margin-bottom: 2rem;">"""

content = content.replace(target2, replacement2)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Button moved successfully.")
