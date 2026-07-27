import re

with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

# Fix map backticks
text = re.sub(r'arr\.map\(\(desc, idx\) =>\s*<div', r'arr.map((desc, idx) => `\n      <div', text)
text = re.sub(r'</div>\s*\)\.join\(''''\);', r'</div>\n    `).join('''');', text)

# Fix insertAdjacentHTML backticks
text = re.sub(r"insertAdjacentHTML\('beforeend',\s*<div", r"insertAdjacentHTML('beforeend', `\n      <div", text)
text = re.sub(r'</div>\s*\);', r'</div>\n    `);', text)

# We also need to fix the template variable interpolation which was stripped by PS!
# Notice in the output: <textarea ... >\</textarea> 
# My python script had: \${desc.replace(/"/g, '&quot;')}
# PowerShell stripped ${desc.replace...} leaving only the \ !
# So I must put back ${desc.replace(/"/g, '&quot;')} in the first textarea of each map.

text = re.sub(r'<textarea class="desc-input-gerador"([^>]*)>\\</textarea>', r'<textarea class="desc-input-gerador"\1>${desc.replace(/"/g, \'&quot;\')}</textarea>', text)
text = re.sub(r'<textarea class="mat-input-gerador"([^>]*)>\\</textarea>', r'<textarea class="mat-input-gerador"\1>${desc.replace(/"/g, \'&quot;\')}</textarea>', text)
text = re.sub(r'<textarea class="desc-input-gerador-fe"([^>]*)>\\</textarea>', r'<textarea class="desc-input-gerador-fe"\1>${desc.replace(/"/g, \'&quot;\')}</textarea>', text)

with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(text)
print("Fixed backticks and vars")
