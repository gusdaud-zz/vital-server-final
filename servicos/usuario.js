/* Variáveis compartilhadas */
var db, apn;
/* Módulos usados */
var email = require('./email');
var config = require("../configuracoes");
var traducao = require("../traducao");
var request = require('request');
var multer  = require('multer');
var fs  = require('fs');
var util = require('util');
var upload = multer({ dest: 'uploads/' });

/* Inicia os serviços de autenticação */
exports.iniciar = function(app, _db, express, _apn) {
    //Salva as variáveis
    db = _db;
    apn = _apn;
    //Registra os serviços
    app.post('/servicos/usuario/dados', dadosUsuario);
    app.get('/servicos/usuario/retornarfoto', retornarFoto);
    app.post('/servicos/usuario/uploadfoto', upload.single('conteudo'), uploadFoto);
    app.post('/servicos/usuario/limparfoto', limparFoto);
    app.post('/servicos/usuario/sincronizaragenda', sincronizarAgenda);
    app.post('/servicos/usuario/validarconvite', validarConvite);
    app.post('/servicos/usuario/enviarconvite', enviarConvite);
    app.post('/servicos/usuario/responderconvite', responderConvite);
    app.post('/servicos/usuario/desassociar', desassociar);
    app.post('/servicos/usuario/reenviarconvitepush', reenviarConvitePush);
    app.post('/servicos/usuario/retornarnotificacoes', retornarNotificacoes);
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

/* Retorna as notificações */
function retornarNotificacoes(req, res) {
    //Salva o código push
    var push = req.body.push;
    //Executa a query
    db.query("SELECT A.Id as id, B.Nome as nome, A.IdProprietario as IdProprietario " +
        "FROM associacao AS A LEFT JOIN usuario " +
        "AS B ON A.IdProprietario = B.Id WHERE A.Reprovado = 0 AND A.IdAssociado = ? " + 
        "AND Aprovado = 0 AND Reprovado = 0 " + 
        "ORDER BY A.DataConvite DESC", [req.usuario], function(err, rows, fields) {
        if (err) 
            res.json({erro: "erronotificacoes", detalhes: err})
        else {
            //Funcionou, salva o código push
            db.query("UPDATE usuario set Push = ? WHERE Id = ?", [push, req.usuario]);
            //monta a matriz com as notificações e retorna
            var notificacoes = [];
            for (var i in rows) { notificacoes.push( { Tipo: "associacao", Dados: { Id: rows[i].id,
                Nome: rows[i].nome, IdProprietario: rows[i].IdProprietario } }); }
            res.json({ok: true, entradas: notificacoes });
        }
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
    db.query("SELECT associacao.Aprovado as A FROM associacao LEFT JOIN usuario ON " +
        "associacao.idAssociado = usuario.Id WHERE associacao.IdProprietario=? AND " +
        "(associacao.ConviteChave=? OR usuario.Email=? OR usuario.Telefone=?)", 
        [req.usuario, dados.chave, dados.chave, dados.chave], function(err, rows, fields) {
        if (err) 
            res.json({erro: "erroaoconvidar"})
        else 
            if (rows.length > 0) 
                //Já está associado
                res.json({ok: true, associado: true, existe: true, aprovado: rows[0].A == 1})
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

/* Desassociar um usuário do atual */
function desassociar(req, res) {
    var id = req.body.id;
    db.query("DELETE FROM associacao WHERE Id=? AND IdProprietario=?", [id, req.usuario], function(err, result) {
    //Verifica o retorno da tentativa
    if (err || (result.affectedRows == 0)) 
        res.json({erro: "erroaodesassociar", detalhes: err})
    else
        res.json({ok: true});
    })

}

/* Reenvia convite via push para usuários existentes */
function reenviarConvitePush(req, res) {
    var id = req.body.id;
    db.query("UPDATE associacao SET DataConvite=NOW() WHERE Id=? AND IdProprietario=? AND Reprovado=0", 
        [id, req.usuario]);
    enviarPush(traducao(req.lingua, "convite"), true 'pedidoassociacao', id);
    res.json({ok: true})
}

/* Envia uma mensagem via push */
function enviarPush(mensagem, associado, tipo, id) {
    //Executa a query
    db.query("SELECT B.Push as tokenassociado, C.Push as tokenproprietario," +
        " C.Nome as nomeproprietario, B.Nome as nomeassociado" +
        " FROM associacao AS A LEFT JOIN usuario AS B " +
        "ON A.IdAssociado = B.Id LEFT JOIN usuario AS C ON A.IdProprietario = C.Id " +
        "WHERE A.Id = ? AND A.Reprovado=0", [id], 
        function(err, rows, fields) {
            //Prepara a mensagem
            mensagem = mensagem.replaceAll("@NOMEPROPRIETARIO@", rows[0].nomeproprietario);
            mensagem = mensagem.replaceAll("@NOMEASSOCIADO@", rows[0].nomeassociado);
            //Se tudo ocorrer bem
            if (!err && rows.length > 0 && rows[0].token != null)
                apn.pushNotification({expiry: Math.floor(Date.now() / 1000) + 3600, 
                    alert: mensagem, payload: { 'tipo': tipo, id: id }}, 
                    associado ? rows[0].tokenassociado : rows[0].tokenproprietario );
       })
}

/* Envia um convite */
function enviarConvite(req, res) {
    //Preparar
    var dados = processarValidar(req, res);
    if (!dados) {return}

    //Executa a query
    db.query("SELECT Nome, Id FROM usuario WHERE " + dados.query, [dados.chave], function(err, rows, fields) {
        if (err) 
            res.json({erro: "erroaoconvidar"})
        else {
            //Query ocorreu bem
            var inserir = {IdProprietario: req.usuario, idAssociado: (rows.length == 0) ? null : rows[0].Id,
                NomeAssociado: dados.nome, ConviteChave: dados.chave };
            //Adiciona a nova entrada
            db.query("INSERT INTO associacao SET ?", inserir, function(err, result) {
                if (err) 
                    //Caso tenha ocorrido um erro ao tentar adicionar a entrada
                    res.json({erro: "erroaoconvidar"})
                else {
                    //Prepara variáveis que serão usadas
                    var nome = (rows.length == 0) ? dados.nome : rows[0].Nome;
                    var idassociado = (rows.length == 0) ? null : rows[0].Id;
                    var id = result.insertId;
                    //Envia o convite push
                    enviarPush(traducao(req.lingua, "convite"), true, 'pedidoassociacao', id);
                    //Tudo funcionou bem, retorna
                    res.json({ok: true, dados: {Nome: nome, IdAssociado: idassociado, Aprovado: false, 
                        Chave: dados.chave, Id: id }, existe: rows.length > 0})          
                }      
            })
        }
    });
    
}

/* Responde a um convite */
function responderConvite(req, res) {
    //Obtém os parâmetros
    var id = req.body.id;
    var aprovado = req.body.aprovado;
    //Valida o parâmetro aceitou
    if ((aprovado != 0) && (aprovado != 1)) {
        res.json({erro: "parametrosinvalidos" });
        return;
    }
    //Chama a query
    db.query("UPDATE Associacao SET " + ((aprovado == 1) ? "Aprovado" : "Reprovado") + 
        " = 1 WHERE IdAssociado = ? AND Id = ?" , [req.usuario, id], function(err, result) {
        if (err || (result.affectedRows == 0)) 
            res.json({erro: "erroaoassociar", detalhes: err})
        else {
            enviarPush(traducao(req.lingua, "aceitouconvite"), false, 'aceitouconvite', id);
            res.json({ok: true});
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
    var usuario = req.query.usuario || req.usuario;
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