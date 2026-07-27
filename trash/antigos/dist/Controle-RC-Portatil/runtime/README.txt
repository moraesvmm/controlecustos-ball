Coloque aqui o arquivo:

python_env.zip

Esse ZIP deve ser o pacote portatil do Python usado pelo
"1_Instalar_Requisitos.bat".

Com isso, o instalador tenta nesta ordem:
1. Usar ".python_local" se ela ja existir.
2. Extrair "runtime\python_env.zip" sem depender de internet.
3. Baixar o ZIP da internet apenas como fallback.

Para distribuir em PCs corporativos com bloqueios, o mais seguro e:
- enviar a pasta ".python_local" ja pronta, ou
- enviar este "runtime\python_env.zip" junto com o projeto.
