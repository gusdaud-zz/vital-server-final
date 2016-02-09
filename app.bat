@echo off
echo Atualizando codigo
git pull vital master
echo Executando NodeJS
node app.js --debug-brk=46979 