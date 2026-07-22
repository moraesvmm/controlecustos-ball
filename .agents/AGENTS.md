## Strict File Reading Rule
NÃO USE SCRIPTS EM PYTHON PARA CODIFICAÇÃO. NEM GET-CONTENT. NEM SELECT-STRING. USE VIEW_FILE OU SUA IDE PARA VER DIRETAMENTE.
Because the environment has limitations (e.g. `grep_search` is unavailable on this Windows machine), you must ALWAYS AND EXCLUSIVELY use the native `view_file` tool to inspect source code. Do not attempt to bypass this with terminal commands.
UNDER NO CIRCUMSTANCES should you use `python -c "with open(...)"` to read files.
