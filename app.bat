@echo off
echo --------- Atualizando codigo
git pull vital master
echo --------- Executando NodeJS com debug na porta 46979
node --debug=46979 app.js