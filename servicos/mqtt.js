/* Para a conexão com a biblioteca do broket do MQTT */
var config = require("../configuracoes"),
    mosca = require('mosca');

/* Início */
module.exports = function() {
    //Aponta o banco de dados
    var db = {
        type: 'mongo',
        url: config.mqtt.url,
        pubsubCollection: 'ascoltatori',
        mongo: {}
    };
    //Parâmetros de configuração
    var params = {
        port: config.mqtt.porta,
        backend: db
    };
    //Inicia o servidor MQTT
    var servidor = new mosca.Server(params);    
    
    //Intercepta mensagens
    servidor.on("published", function(packet, client) {
        console.log(packet);
        //servidor.emit(topic, JSON.parse(payload));
    })
    
    //Retorna referência ao servidor
    return servidor;
}
