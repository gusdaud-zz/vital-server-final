
/* Início */
module.exports = function() {
/* Para a conexão com a biblioteca do broket do MQTT */
var config = require("../configuracoes"),
    mosca = require('mosca');

    //Aponta o banco de dados
    var db = {
        type: 'mongo',
        url: config.mqtt.url,
        pubsubCollection: 'ascoltatori',
        mongo: {}
    };
    //Parâmetros de configuração
    var config = {
        port: config.mqtt.porta,
        backend: db
    };
    //Inicia o servidor MQTT
    var servidor = new mosca.Server(config);    
    
    //Intercepta mensagens
    servidor.on("message", function(topic, payload) {
        servidor.emit(topic, JSON.parse(payload));
    })
    
    //Retorna referência ao servidor
    return servidor;
}
