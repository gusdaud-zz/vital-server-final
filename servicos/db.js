/* Para conexão com o banco de dados */
var config = require("../configuracoes"),
    mysql = require('mysql');
var _db = null;


/* Conectar com o banco de dados */
function conectar() {
   //Cria a conexão
   _db = mysql.createConnection({
        host     : config.mysql.servidor,
        user     : config.mysql.usuario,
        password : config.mysql.senha,
        database : config.mysql.database
   });    
}

/* Para executar uma query */
exports.query = function(sql, values, cb) {
    return _db.query(sql, values, cb)    
}

/* Iniciar a conexão */
exports.iniciar = function() { 
    //Conecta com o banco de dados
    conectar();
   
    //Executa uma query a cada 5 segundos para manter a conexão ativa
    setInterval(function () {
        _db.query('SELECT 1');
    }, 5000);

    //Caso tenha ocorrido algum erro
    _db.on('error', function(err) {
        console.log("Erro com a conexão do banco de dados (" + err.code + 
           "), reconetando..");
        conectar();
    });
}