echo off
echo Atualizando codigo
git pull vital master > NULL
echo Executando NodeJS
node --debug-brk=46979 --nolazy app.js 