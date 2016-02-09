@echo off
echo --------- Atualizando codigo
git pull vital master
echo --------- Executando NodeJS com debug na porta 46979
node app.js --debug-brk=46979