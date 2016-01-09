/* Servidor do Vital - © Gustavo Huffenbacher Daud */

/* Carrega os módulos usados */
var express = require('express'),
    http = require('http'),
    https = require('https'),
    os = require('os'),
    fs = require('fs'),
    config = require("./configuracoes"),
    db = require('./servicos/db'),
    autenticacao = require('./servicos/autenticacao'),
    usuario = require('./servicos/usuario'),
    bodyParser = require('body-parser'),
    app = express();

/* Inicia o servidor */
function iniciarServidor(local) {
    //Chaves para conexão SSL
    var ssl = {
        key: fs.readFileSync('certificados/ssl.key'),
        cert: fs.readFileSync('certificados/2_kvital.com.crt')
    };
    //Abre o servidor na porta 8443 para o servidor de desenvolvimento ou 443 para produção
    var porta = local ? 8080 : 443;
    if (local)
        http.createServer(app).listen(porta)
    else
        https.createServer(ssl, app).listen(porta);
    console.log("Servidor iniciado na porta " + porta);
    //Inicia os middlewares do express
    app.use(bodyParser.json()); 
    app.use(bodyParser.urlencoded({ extended: true })); 
    app.use(express.static('public'));
}

/* Funções de inicialização */
var local = os.homedir().toLowerCase().indexOf("gustavo") > 0;
iniciarServidor(local);
db.iniciar(app);
autenticacao.iniciar(app, db, express);
usuario.iniciar(app, db, express);