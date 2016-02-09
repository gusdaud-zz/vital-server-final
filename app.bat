@echo off

IF "%~1"=="–FIX_CTRL_C" (
SHIFT
) ELSE (
CALL <NUL %0 –FIX_CTRL_C %*
GOTO :EOF
)

echo --------- Atualizando codigo
git pull vital master
echo --------- Executando NodeJS em modo debug na porta 46979
node --nolazy --debug=46979 app.js