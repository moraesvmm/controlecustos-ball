$ruleText = @"

## Tool Usage Constraints
Use SEMPRE as ferramentas nativas view_file e grep_search (ou acesse diretamente via IDE) para ler, inspecionar ou buscar conteúdos de arquivos. 
É ESTRITAMENTE PROIBIDO utilizar select-string, get-content, findstr, scripts em Python (ou semelhante) para resgatar blocos de código ou ler arquivos.
"@

Add-Content -Path "C:\Users\VMORAES1\.gemini\config\AGENTS.md" -Value $ruleText
