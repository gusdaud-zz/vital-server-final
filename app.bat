@echo off
echo --------- Atualizando codigo
git pull vital master
echo --------- Executando NodeJS em modo debug na porta 46979
node --nolazy --debug-brk=46979 app.js