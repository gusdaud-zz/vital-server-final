/* Variáveis compartilhadas */
var db;
/* Módulos usados */
var email = require('./email');
var config = require("../configuracoes");
var traducao = require("../traducao");
var request = require('request');

/* Inicia os serviços de autenticação */
exports.iniciar = function(app, _db, express) {
    //Salva a variável
    db = _db;
    //Registra os serviços
    app.post('/servicos/usuario/dados', dadosUsuario);
    app.get('/servicos/usuario/foto', fotoUsuario);
}

/* Retorna os dados do usuário */
function dadosUsuario(req, res) {
    //Obtém os dados do usuário
    db.query('SELECT Nome, Email, Facebook_Id, Publico FROM Sessao LEFT JOIN Usuario' +
        ' ON Sessao.Usuario = Usuario.Id  WHERE Sessao.Token=?', [req.token], 
        function(err, rows, fields) {
        if (err) 
            res.json({erro: "erronologin", detalhes: err})
        else if (rows.length == 0)
            res.json({erro: "erronologin"})
        else
            res.json({ok: true, 
                usuario: {Nome: rows[0].Nome, Email: rows[0].Email, Facebook_Id: rows[0].Facebook_Id},
                publico: JSON.parse(rows[0].Publico)});
    });
}

/* Retorna a foto do usuário */
function fotoUsuario(req, res) {
    //Obtém os dados do usuário
    var usuario = req.usuario || req.query.usuario;
    db.query('SELECT Nome, Facebook_Id, Foto FROM Usuario WHERE Id=?', [usuario], 
        function(err, rows, fields) {
        if (err) 
            res.json({erro: "erro", detalhes: err})
        else if (rows.length == 0)
            res.json({erro: "erro"})
        else {
            //Se hover foto armazenada no perfil
            if (rows[0].Foto != null)
                res.write(rows[0].Foto)
            //Se houver foto no facebook
            else if (rows[0].Facebook_Id != null)
                request("http://graph.facebook.com/" + rows[0].Facebook_Id + 
                    "/picture?width=100&height=100").pipe(res)
            else
                res.end();            
        }
    });    
}