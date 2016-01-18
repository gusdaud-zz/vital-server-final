/* Variáveis compartilhadas */
var db;
/* Módulos usados */
var email = require('./email');
var config = require("../configuracoes");
var traducao = require("../traducao");
var request = require('request');
var multer  = require('multer')
var fs  = require('fs')
var upload = multer({ dest: 'uploads/' })

/* Inicia os serviços de autenticação */
exports.iniciar = function(app, _db, express) {
    //Salva a variável
    db = _db;
    //Registra os serviços
    app.post('/servicos/usuario/dados', dadosUsuario);
    app.get('/servicos/usuario/retornarfoto', retornarFoto);
    app.post('/servicos/usuario/uploadfoto', upload.single('conteudo'), uploadFoto);
}

/* Retorna os dados do usuário */
function dadosUsuario(req, res) {
    //Obtém os dados do usuário
    db.query('SELECT Nome, Email, Publico FROM Sessao LEFT JOIN Usuario' +
        ' ON Sessao.Usuario = Usuario.Id  WHERE Sessao.Token=?', [req.token], 
        function(err, rows, fields) {
        if (err) 
            res.json({erro: "erronologin", detalhes: err})
        else if (rows.length == 0)
            res.json({erro: "erronologin"})
        else
            res.json({ok: true, 
                usuario: {Nome: rows[0].Nome, Email: rows[0].Email},
                publico: JSON.parse(rows[0].Publico)});
    });
}

/* Upload da foto do usuário */
function uploadFoto(req, res) {
    if (req.file) {
        //Upload para o banco de dados
        var foto = fs.readFileSync(req.file.path);
        db.query("UPDATE Usuario SET Foto=? WHERE Id=?", [foto, req.usuario], function(err, result) {
            //Apaga o arquivo
            fs.unlink(req.file.path);       
            //Verifica o retorno
            if (err) 
                res.json({erro: "erronoupload", detalhes: err})
            else
                res.json({ok: true});
        })
        
    }
}

/* Retorna a foto do usuário */
function retornarFoto(req, res) {
    //Obtém os dados do usuário
    var usuario = req.usuario || req.query.usuario;
    db.query('SELECT Nome, Foto FROM Usuario WHERE Id=?', [usuario], 
        function(err, rows, fields) {
        if (err) 
            res.json({erro: "erro", detalhes: err})
        else if (rows.length == 0)
            res.json({erro: "erro"})
        else {
            //Se hover foto armazenada no perfil
            if (rows[0].Foto != null) {
                res.setHeader('content-type', 'image/jpeg');
                res.write(rows[0].Foto);
                res.end();
            }
            else
                res.end();            
        }
    });    
}