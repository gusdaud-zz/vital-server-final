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
    dispositivo = require('./servicos/dispositivo'),
    bodyParser = require('body-parser'),
    app = express(),
    mosca = require('mosca'),
    apn = require('apn');

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
    app.use(express.static('public'));
    app.use(bodyParser.json()); 
    app.use(bodyParser.urlencoded({ extended: true })); 
}

/* Inicializa o Apple Notification */
function iniciarApn() {
    //Inicializa o objeto para envio de push de produçãp
    var opcoes = { cert: "certificados/apn-cert-producao.pem", 
        key: "certificados/apn-key-producao.pem", production: true };
    var apnProducao = new apn.Connection(opcoes); 
    //Inicializa o objeto para o envio de push de modo de desenvolvimento
    opcoes.cert = "certificados/apn-cert-desenvolvimento.pem";
    opcoes.key = "certificados/apn-key-desenvolvimento.pem";
    opcoes.production = false;
    var apnDesenvolvimento = new apn.Connection(opcoes); 
    
    //Retorno o objeto
    return {
        pushNotification: function(nota, token) {
            if (token == null) return;
            var dispositivo = new apn.Device(token);
            var notificacao = new apn.Notification();
            for(var atributo in nota) {
                notificacao[atributo] = nota[atributo];
            }
            apnProducao.pushNotification(notificacao, dispositivo);
            apnDesenvolvimento.pushNotification(notificacao, dispositivo);
        }
    }
}

/* Para substituir todas as ocorrências de um caractere em um string */
String.prototype.replaceAll = function (find, replace) {
    var str = this;
    return str.replace(new RegExp(find, 'g'), replace);
};

/* Inicia o MQTT */
function iniciarMqtt() {
    //Prepara o banco de dados
    console.log("iniciando MQTT");
    var db = {
        type: 'mongo',
        url: 'mongodb://localhost:27017/mqtt',
        pubsubCollection: 'ascoltatori',
        mongo: {}
    };
    //Parâmetros de configuração
    var config = {
        port: 1883,
        backend: db
    };
    //Inicia o servidor MQTT
    var servidor = new mosca.Server(config);    
    return servidor;
}

/* Funções de inicialização */
var local = os.homedir().toLowerCase().indexOf("gustavo") > 0;
iniciarServidor(local);
var apnConn = iniciarApn();
var mqtt = iniciarMqtt();
db.iniciar(app);
dispositivo.iniciar(app, db, express);
autenticacao.iniciar(app, db, mqtt);
usuario.iniciar(app, db, express, apnConn, mqtt);
