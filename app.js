/* Servidor do Vital - © Gustavo Huffenbacher Daud */

/* Carrega os módulos usados */
var express = require('express'),
    http = require('http'),
    https = require('https'),
    os = require('os'),
    fs = require('fs'),
    config = require("./configuracoes"),
    mysql = require('mysql'),
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

/* Inicia o banco de dados */
function iniciarDB() {
    //Cria a conexão
   var db = mysql.createConnection({
        host     : config.mysql.servidor,
        user     : config.mysql.usuario,
        password : config.mysql.senha,
        database : config.mysql.database
    }); 
    
    //Executa uma query a cada 5 segundos para manter a conexão ativa
    setInterval(function () {
        db.query('SELECT 1');
    }, 5000);

    //Caso tenha ocorrido algum erro
    db.on('error', function(err) {
        console.log("Erro com a conexão do banco de dados - " + err.code);
    });
    return db;
}

/* Funções de inicialização */
console.log(os.homedir());
var local = os.homedir().indexOf("gustavo") > 0;
iniciarServidor(local);
var db = iniciarDB()
autenticacao.iniciar(app, db, express);
usuario.iniciar(app, db, express);