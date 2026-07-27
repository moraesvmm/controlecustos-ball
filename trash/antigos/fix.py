import re

with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. currentActivities and editedPlanoItems Backend
content = content.replace('let currentActivities = [];', 'let currentActivities = [];\n  if (!window.editedPlanoItems) window.editedPlanoItems = new Set();')

# 2. backend tr ondblclick
old_tr = '''        const mat = (Array.isArray(a.material) ? a.material.join('\\n') : String(a.material || '')).replace(/"/g, '&quot;');
        return <tr>
          <td><strong></strong></td>'''
new_tr = '''        const mat = (Array.isArray(a.material) ? a.material.join('\\n') : String(a.material || '')).replace(/"/g, '&quot;');
        const isEdited = window.editedPlanoItems && window.editedPlanoItems.has(a.identificador);
        return <tr ondblclick="abrirModalAtividadePlano()" style="cursor:pointer; ">
          <td><strong></strong></td>'''
content = content.replace(old_tr, new_tr)

# 3. backend fecharModalAtividadePlano
old_fechar = '''    fecharModalAtividadePlano();
    renderPlanoActivitiesTable();'''
new_fechar = '''    if (window.editedPlanoItems && currentActivities[editandoPlanoIdx]) window.editedPlanoItems.add(currentActivities[editandoPlanoIdx].identificador);
    fecharModalAtividadePlano();
    renderPlanoActivitiesTable();'''
content = content.replace(old_fechar, new_fechar)

# 4. backend clear edited on aplicar
old_aplicar = '''    } finally {
      btnAplicar.disabled = !contextoCompleto() || currentActivities.length === 0;
      btnAplicar.textContent = '✔️ Aplicar Plano à Preventiva';
    }'''
new_aplicar = '''    } finally {
      btnAplicar.disabled = !contextoCompleto() || currentActivities.length === 0;
      btnAplicar.textContent = '✔️ Aplicar Plano à Preventiva';
      if (window.editedPlanoItems) window.editedPlanoItems.clear();
      renderPlanoActivitiesTable();
    }'''
content = content.replace(old_aplicar, new_aplicar)


# FE
# 1. currentActivitiesFE and editedPlanoItemsFE
content = content.replace('let currentActivitiesFE = [];', 'let currentActivitiesFE = [];\n  if (!window.editedPlanoItemsFE) window.editedPlanoItemsFE = new Set();')

# 2. frontend tr ondblclick
old_tr_fe = '''    tbody.innerHTML = currentActivitiesFE.map((a, i) => 
        <tr>
          <td></td>'''
new_tr_fe = '''    tbody.innerHTML = currentActivitiesFE.map((a, i) => {
      const isEdited = window.editedPlanoItemsFE && window.editedPlanoItemsFE.has(a.id);
      return <tr ondblclick="abrirFormularioPreventivaFE('')" style="cursor:pointer; ">
          <td></td>'''
content = content.replace(old_tr_fe, new_tr_fe)

# Since we opened a block for map in FE, we need to close it:
old_map_close = '''          <td>
            <button class="btn btn-ghost btn-sm btn-editar-plano-fe" data-id="">✏️ Editar</button>
          </td>
        </tr>
      ).join('');'''
new_map_close = '''          <td>
            <button class="btn btn-ghost btn-sm btn-editar-plano-fe" data-id="">✏️ Editar</button>
          </td>
        </tr>
      }).join('');'''
content = content.replace(old_map_close, new_map_close)


# 3. frontend fecharFormularioPreventivaFE
old_fechar_fe = '''    fecharFormularioPreventivaFE();
    renderPlanoActivitiesTableFE();'''
new_fechar_fe = '''    if (window.editedPlanoItemsFE) window.editedPlanoItemsFE.add(currentActivityFEId);
    fecharFormularioPreventivaFE();
    renderPlanoActivitiesTableFE();'''
content = content.replace(old_fechar_fe, new_fechar_fe)

# 4. frontend clear edited on aplicar
old_aplicar_fe = '''    } finally {
      btnAplicarPlanoFE.disabled = !contextoFECompleto() || currentActivitiesFE.length === 0;
      btnAplicarPlanoFE.textContent = '✔️ Aplicar Plano ao Front-end';
    }'''
new_aplicar_fe = '''    } finally {
      btnAplicarPlanoFE.disabled = !contextoFECompleto() || currentActivitiesFE.length === 0;
      btnAplicarPlanoFE.textContent = '✔️ Aplicar Plano ao Front-end';
      if (window.editedPlanoItemsFE) window.editedPlanoItemsFE.clear();
      renderPlanoActivitiesTableFE();
    }'''
content = content.replace(old_aplicar_fe, new_aplicar_fe)


with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
