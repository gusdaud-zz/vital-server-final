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
    app.post('/servicos/usuario/limparfoto', limparFoto);
    app.post('/servicos/usuario/sincronizaragenda', sincronizarAgenda);
    app.post('/servicos/usuario/validarconvite', validarConvite);
    app.post('/servicos/usuario/enviarconvite', enviarConvite);
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

/* Para sincronizar a agenda */
function sincronizarAgenda(req, res) {
    //Carrega as variáveis
    var emails = req.body.emails;
    var telefones = req.body.telefones;
    //Prepara a query
    //Cria a tabela temporária
    var query = "CREATE TEMPORARY TABLE IF NOT EXISTS tmp (ordem INT, email VARCHAR(100), telefone VARCHAR(100));\n";
    //Adiciona as entradas
    query += "INSERT INTO tmp VALUES ";
    for (var i = 0; i < emails.length; i++) {
        query += "(" + (i + 1) + ", " + db.escape(emails[i]) + ", " + db.escape(telefones[i]) +  ")" + 
            ((i < emails.length - 1) ? ", " : "")  
    }
    query += ";\n "; 
    //Define a query de procura e por fim apaga a tabela temporária
    query += "SELECT IF(usuario.Id IS NULL, 0, 1) AS res FROM tmp LEFT JOIN usuario ON tmp.email = usuario.Email " +
        " OR tmp.telefone = usuario.Telefone ORDER BY tmp.ordem; DROP TABLE tmp;";
            fs.writeFile('log.txt', JSON.stringify(query));

    //Executa a query
    db.query(query, function(err, rows, fields) {
        if (err) 
            res.json({erro: "erroaosincronizar", detalhes: err})
        else {
            //Funcionou, monta e retorna a matriz
            var linhas = [];
            for (var i in rows[2]) { linhas.push(rows[2][i].res); }
            res.json({ok: true, entradas: linhas });
        }
    });
    
}

/* Processa antes de validar */
function processarValidar(req, res) {
    //Carrega as variáveis
    var telefone = req.body.telefone;
    var email = req.body.email;
    var chave = "", query = "";
    //Faz as validações e prepara a query
    if (typeof telefone == "string" && telefone.length > 0) {
        chave = telefone
        query = "telefone = ?" 
    } else if (typeof email == "string" && email.length > 0) {
        chave = email
        query = "email = ?" 
    } else {
        res.json({err: "parametrosinvalidos"});
        return;
    }
    return {chave: chave, query: query, nome: req.body.nome};
}

/* Valida antes de enviar um convite */
function validarConvite(req, res) {
    //Preparar
    var dados = processarValidar(req, res);
    if (!dados) {return}
    //Executa a query para verificar se o convite já foi enviado ou se já está associado
    db.query("SELECT associacao.Id as A, usuario.ID as B FROM associacao LEFT JOIN usuario ON " +
        "associacao.idAssociado = usuario.Id WHERE associacao.IdProprietario=? AND " +
        "(associacao.ConviteChave=? OR usuario.Email=? OR usuario.Telefone=?)", 
        [req.usuario, dados.chave, dados.chave, dados.chave], function(err, rows, fields) {
        if (err) 
            res.json({erro: "erroaoconvidar"})
        else 
            if (rows.length > 0) 
                //Já está associado
                res.json({ok: true, associado: true, existe: true, aprovado: rows[0].B != null})
            else 
                //Não está associado, verifica se existe
                db.query("SELECT Id FROM usuario WHERE " + dados.query, [dados.chave], function(err, rows, fields) {
                    if (err) 
                        res.json({erro: "erroaoconvidar"})
                    else if (rows.length > 0)
                        res.json({ok: true, associado: false, existe: true, aprovado: false})
                    else
                        res.json({ok: true, associado: false, existe: false, aprovado: false})
                })
    });
}

/* Envia um convite */
function enviarConvite(req, res) {
    //Preparar
    var dados = processarValidar(req, res);
    if (!dados) {return}
    console.log(dados);

    //Executa a query
    db.query("SELECT Id FROM usuario WHERE " + dados.query, [dados.chave], function(err, rows, fields) {
        if (err) 
            res.json({erro: "erroaoconvidar"})
        else {
            //Query ocorreu bem
            var dados = {IdProprietario: req.usuario, idAssociado: (rows.length == 0) ? null : rows[0].Id,
                NomeAssociado: dados.nome, ConviteChave: (rows.length == 0) ? dados.chave : null };
            //Adiciona a nova entrada
            db.query("INSERT INTO associacao SET ?", dados, function(err, result) {
                if (err) 
                    //Caso tenha ocorrido um erro ao tentar adicionar a entrada
                    res.json({erro: "erroaoconvidar"})
                else 
                    //Tudo funcionou bem, retorna
                    res.json({ok: true, existe: rows.length > 0})                
            })
        }
    });
    
}

/* Limpa a foto do usuário */
function limparFoto(req, res) {
    db.query("UPDATE Usuario SET Foto=NULL WHERE Id=?", [req.usuario], function(err, result) {
        //Verifica o retorno da tentativa
        if (err) 
            res.json({erro: "erroaolimparfoto", detalhes: err})
        else
            res.json({ok: true});
    })
}

/* Upload da foto do usuário */
function uploadFoto(req, res) {
    if (req.file) {
        //Upload para o banco de dados
        var foto = fs.readFileSync(req.file.path);
        db.query("UPDATE Usuario SET Foto=? WHERE Id=?", [foto, req.usuario], function(err, result) {
            //Apaga o arquivo
            fs.unlink(req.file.path);       
            //Verifica o retorno da tentativa
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
                res.json({ok: true, nome: rows[0].Nome});
        }
    });    
}