/* Serviços de autenticação */

/* Variáveis compartilhadas */
var db;
/* Módulos usados */
var basicAuth = require('basic-auth');
var crypto = require('crypto');
var request = require('request');
var fb = require('fb');
var email = require('./email');
var config = require("../configuracoes");
var traducao = require("../traducao");

/* Inicia os serviços de autenticação */
exports.iniciar = function(app, _db, express) {
    //Salva a variável
    db = _db;
    //Registra os serviços
    app.post('/servicos/autenticacao/telefone', loginTelefone);
    app.post('/servicos/autenticacao/email', loginEmail);
    app.post('/servicos/autenticacao/facebook', loginFacebook);
    app.post('/servicos/autenticacao/criarusuario', criarNovoUsuario);
    app.post('/servicos/autenticacao/confirmaremail', confirmarEmail);
    //Pedidos que requerem o token
    app.use(requerToken);
    app.get('/servicos/autenticacao/logout', logout);
    //Limpa os tokens antigos agora e a cada 1 hora  e registros sem 
    //confirmação agora e a cada 6 horas
    setInterval(limparTokens, 1000 * 60 * 60);
    setInterval(limparRegistrosSemConfirmacao, 1000 * 60 * 60 * 6);
    limparTokens();
    limparRegistrosSemConfirmacao();
}

/* Logout, apaga o token */
function logout(req, res) {
	var token = req.body.token || req.query.token || req.headers['x-access-token'];
    db.query('DELETE FROM Sessao WHERE Id=?', [token], function(err) {
        if (err) 
            res.json({erro: "erronologout", detalhes: err})
        else
            res.json({ok: true});
    });
}

/* Valida o token */
exports.validarToken = function(token, callback) {
    //Executa a query
    db.query('SELECT Usuario from Sessao WHERE Id=?', [token], 
         function(err, rows, fields) {
             if (!err) {
                 if (rows.length == 0)
                    callback(false)
                else
                    callback(true, rows[0].Usuario)    
             } else {
                 callback(false)
             }
         })
}

/* Valida se requer o token */
function requerToken(req, res, next) {
    //Procura pelo token
	var token = req.body.token || req.query.token || req.headers['x-access-token'];
    //Decodifica o token
    if (token) {
        exports.validarToken(token, function(ok, usuario) {
            if (ok)  //Token válido
            {
                //Salva o usuário e token
                req.token = token;
                req.usuario = usuario;
                next()
            }
            else //Token inválido
                res.send({erro: 'tokeninvalido' })
        })
    } else {
        //Não forneceu o token
        return res.status(403).send({ 
			erro: 'semtoken'
		});
    }
}

/* Limpa os tokens antigos */
function limparTokens() {
    db.query('DELETE FROM Sessao WHERE Expira < (NOW() - INTERVAL 1 HOUR)')
}
/* Limpa os registros sem confirmação */
function limparRegistrosSemConfirmacao() {
    db.query('DELETE FROM Usuario WHERE PendenteConfirmar IS NOT NULL AND Criacao < (NOW() - INTERVAL 24 HOUR)')    
}

/* Retorna os dados do usuário */
function retornarUsuario(token, req, res) {
    db.query('SELECT Nome, Email, Facebook_Id, Publico FROM Sessao LEFT JOIN Usuario' +
        ' ON Sessao.Usuario = Usuario.Id  WHERE Sessao.Id=?', [token], 
        function(err, rows, fields) {
            if (!err) { 
                if (rows.length > 0)
                    res.json({ok: true, token: token, 
                        usuario: {Nome: rows[0].Nome, Email: rows[0].Email, Facebook_Id: rows[0].Facebook_Id},
                        publico: JSON.parse(rows[0].Publico)})
                else
                    res.json({ erro: "errodb" })
            } else 
                res.json({ erro: "errodb" })
        } );
}

/* Serviço para login com facebook, retorna token */
function loginFacebook(req, res) {

    //Conecta-se com o facebook
    fb.api('me', { fields: ['id', 'name', 'email'], access_token: req.body.facebooktoken }, function (fres) {
        if (fres.error)
            res.json({erro: "errofacebook", detalhes: fres.error})
        else { 
            //Executa a query
            var Email = fres.email;
            var FID = fres.id;
            db.query('SELECT Id, Facebook_Id from Usuario WHERE Email=? AND PendenteConfirmar IS NULL', 
                [Email], function(err, rows, fields) {
                if (!err) {
                    if (rows.length > 0) //Se já existir a entrada
                    {
                        //Cria o token e retorna
                        gerarToken(rows[0].Id, function(err, token) {
                            retornarUsuario(token, req, res)
                        });
                        //Associa se não exister ao facebook
                        if (rows[0].Facebook_Id != FID)
                            db.query("UPDATE Usuario SET Facebook_Id=? WHERE Id=?", [FID, rows[0].Id]);
                    }
                    else  //Se não existir, cria o usuário
                        criarUsuario(fres.email, fres.name, gerarSenha(8), fres.id, null, function(err, result) {
                            if (err)
                                res.json({erro: "errocriarusuario" })
                            else
                                gerarToken(result.insertId, function(err, token) {
                                    retornarUsuario(token, req, res);
                                })
                        })
                } else
                    res.json({ erro: "errodb" });
            });
        }
    });
}

/* Valida o email */
function validarEmail(email) {
    var re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

/* Cria um novo usuário */
function criarNovoUsuario(req, res) {
    //Salva as variáveis
    var Telefone = req.body.telefone;
    var Nome = req.body.nome;
    var Email = req.body.email;
    var Senha = req.body.senha;
    var Lingua = req.body.lingua;
    //Valida o telefone
    if (typeof Telefone != "string" || Telefone.length < 2) {
        res.json({erro: "telefoneinvalido" })
        return;
    }
    //Valida o nome
    if (typeof Nome != "string" || Nome.length < 2) {
        res.json({erro: "nomeinvalido" })
        return;
    }
    //Valida o email
    if ((Email != undefined) && (typeof Email != "string" || !validarEmail(Email)) {
        res.json({erro: "emailinvalido" })
        return;
    }
    //Valida a senha
    if (typeof Senha != "string" || Senha.length < 2) {
        res.json({erro: "senhainvalida" })
        return;
    }
    //Verifica se o email está cadastrado
    db.query("SELECT Id FROM Usuario WHERE Email=? AND PendenteConfirmar IS NULL", [Email], 
        function(err, rows, fields) {
        //Se houver algum erro na verificação
        if (err) 
            res.json({erro: "errocriar", detalhes: err })
        else {
            //Se já houver algum usuário registrado com este e-mail
            if (rows.length > 0)
                res.json({erro: "existe" })
            else {
                //Não existe, podemos criar
                var pendenteConfirmar = gerarSenha(4);
                criarUsuario(Telefone, Email, Nome, Senha, null, pendenteConfirmar, function(err, result) {
                    //Ocorreu um erro ao tentar criar
                    if (err)
                        res.json({erro: "errocriar", detalhes: err })
                    else {
                        //Criado, envia email de confirmação
                        enviarEmailConfirmacao(Nome, Email, pendenteConfirmar, Lingua, function(erro, info) {
                            //Ocorreu um erro ao enviar o e-mail de confirmação
                            if (erro)
                                res.json({erro: "erroenviaremail" })
                            else //Tudo ocorreu bem
                                res.json({ok: true});                        
                        });
                    }
                })
            } 
        }
    });
}

/* Envia o email de confirmação */
function enviarEmailConfirmacao(Nome, Email, Confirmacao, Lingua, callback) {
    email.enviarEmailTemplate(Email, traducao(Lingua, "emailconfirmacaoassunto"), traducao(Lingua, "emailconfirmacaohtml"), {Nome: Nome,
        Link: config.vital.base + "servicos/confirmaremail?codigo=" + Confirmacao + 
        "&lingua=" + Lingua , Codigo: Confirmacao }, callback)
}

/* Confirmar email */
function confirmarEmail(req, res) {
    var codigo = req.body.codigo;
    var lingua = req.body.lingua;
    var online = req.body.online;
    //Procura para verificar se existe
    db.query("UPDATE Usuario SET PendenteConfirmar=NULL WHERE PendenteConfirmar=?", [codigo], 
        function(err, result) {
            if (online == true) {  //Confirmação pelo sistema
                if (err)
                    res.json({erro: "erroconfirmar" })
                else if (result.affectedRows == 0) 
                    res.json({erro: "codigoinvalido" })
                else 
                    res.json({ok: true })
            } else {  //Usuário clicou diretamente no link
            //
                if (err)
                    res.send(traducao(lingua,"emailconfirmacaoerro"))
                else if (result.affectedRows == 0) 
                    res.send(traducao(lingua,"emailconfirmacaoerro"))
                else 
                    res.sendFile("./templates/" + traducao(lingua, "emailconfirmacaosucessohtml"))
                }
        })
}

/* Cria um usuário */
function criarUsuario(telefone, email, nome, senha, facebook_id, pendenteConfirmar, callback) {
    var item = {
        Telefone: telefone,
        Email: email,
        Nome: nome,
        Senha: senha,
        PendenteConfirmar: pendenteConfirmar, 
        Facebook_Id: facebook_id
    };
    db.query("INSERT INTO Usuario SET ?", item, callback);
}

/* Gera uma senha aleatória */
function gerarSenha(caracteres) {
    return crypto.randomBytes(caracteres).toString("hex"); 
}

/* Gera um novo token */
function gerarToken(usuario, callback) {
    var expira = new Date();
    expira.setHours(expira.getHours() + 1);
    var token = {Id: gerarSenha(28), 
        Expira: expira, Usuario: usuario};
    db.query("INSERT INTO Sessao SET ?", token, function(err, result) {
        callback(err, token.Id);
    });
    //Atualiza com a data e horário do último acesso
    db.query("UPDATE Usuario SET Acesso=NOW() WHERE Id=?", [usuario]);

}

/* Serviço para login com telefone, retorna token */
function loginTelefone(req, res) {
    //Salva telefone e senha
    var Telefone = req.body.telefone;
    var Senha = req.body.senha;
    if (Telefone == "") {
        res.json({ erro: "semtelefone" });
        return;
    }
    
    //Executa a query
    db.query('SELECT Id, Senha from Usuario WHERE Telefone=? AND PendenteConfirmar IS NULL', [Telefone], 
        function(err, rows, fields) {
        if (!err) {
            //Senha ou usuário estão incorretos
            if (rows.length == 0) 
                res.json({erro: "usuarionaoencontrado" })
            //Encontrou o usuário, cria o token
            else 
            {
                //Valida se a a senha está correta
                if (rows[0].Senha != Senha) {
                   res.json({ erro: "senhaincorreta" } );
                   return;
                } 
                //Gera o token
                gerarToken(rows[0].Id, function(err, token) {
                    if (err) 
                        res.json({ erro: "erroaogerartoken" } )
                    else
                        retornarUsuario(token, req, res)
                });
            }
        }
        else 
            res.json({erro: "errodb" });
    });
}

/* Serviço para login com e-mail, retorna token */
function loginEmail(req, res) {
    //Obtém o usuário
    var usuario = basicAuth(req);
    if (!usuario) {
        res.json({erro: "semusuario" });
        return;
    }
    var Email = usuario.name;
    var Senha = usuario.pass;
    //Executa a query
    db.query('SELECT Id from Usuario WHERE Email=? AND Senha=? AND PendenteConfirmar IS NULL', [Email, Senha], 
        function(err, rows, fields) {
        if (!err) {
            //Senha ou usuário estão incorretos
            if (rows.length == 0) 
                res.json({erro: "usuarionaoencontrado" })
            //Encontrou o usuário, cria o token
            else 
            {
                gerarToken(rows[0].Id, function(err, token) {
                    if (err) 
                        res.json({ erro: "erroaogerartoken" } )
                    else
                        retornarUsuario(token, req, res)
                });
            }
        }
        else 
            res.json({erro: "errodb" });
    });
}