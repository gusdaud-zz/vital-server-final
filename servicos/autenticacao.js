/* Serviços de autenticação */

/* Variáveis compartilhadas */
var db, mqtt;
/* Módulos usados */
var path = require('path');
var basicAuth = require('basic-auth');
var crypto = require('crypto');
var request = require('request');
var email = require('./email');
var config = require("../configuracoes");
var traducao = require("../traducao");
var twilio = require('twilio')(config.twilio.sid, config.twilio.token);

/* ##### Para não enviar mensagens pelo twilio até que esteja em produção ##### */
/*twilio.sendMessage = function(dados, callback) {
    console.log("O SMS para " + dados.to + " com a mensagem '" + dados.body + "' não foi enviada propositalmente." );
    callback(null, true);
}*/

/* Inicia os serviços de autenticação */
exports.iniciar = function(app, _db, _mqtt) {
    //Salva a variável
    db = _db;
    mqtt = _mqtt;
    //Registra os serviços
    app.post('/servicos/autenticacao/telefone', loginTelefone);
    app.post('/servicos/autenticacao/criarusuario', criarNovoUsuario);
    app.get('/servicos/autenticacao/confirmaremail', confirmarEmail);
    app.post('/servicos/autenticacao/confirmartelefone', confirmarTelefone);
    //Do servidor MQTT
    mqtt.on('ready', loginMqtt);

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
    db.query('SELECT Usuario, Lingua from Sessao WHERE Id=?', [token], 
         function(err, rows, fields) {
             if (!err) {
                 if (rows.length == 0)
                    callback(false)
                else
                    callback(true, rows[0].Usuario, rows[0].Lingua)    
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
        exports.validarToken(token, function(ok, usuario, lingua) {
            if (ok)  //Token válido
            {
                //Salva o usuário e token
                req.token = token;
                req.usuario = usuario;
                req.lingua = lingua;
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
    db.query('DELETE FROM Usuario WHERE ConfirmarTelefone IS NOT NULL AND Criacao < (NOW() - INTERVAL 24 HOUR)')    
}

/* Retorna os dados do usuário */
function retornarUsuario(id, token, req, res) {
    db.query('SELECT Telefone, Nome, Sobrenome, Email, Publico FROM Sessao LEFT JOIN Usuario' +
        ' ON Sessao.Usuario = Usuario.Id  WHERE Sessao.Id=?', [token], 
        function(err, rows, fields) {
            if (!err) { 
                if (rows.length > 0)
                    //Se tudo funcionar bem, procura pelos usuários associados
                    db.query('SELECT IF(usuario.Nome IS NULL, associacao.NomeAssociado, usuario.Nome) as nome, ' + 
                        'associacao.IdAssociado as idassociado, (associacao.Aprovado = 1) as aprovado, ' +
                        'associacao.Id as id, ' + 
                        'IF(associacao.aprovado = 1, NULL, associacao.ConviteChave) as chave  FROM associacao ' + 
                        'LEFT JOIN usuario ON associacao.idAssociado = usuario.ID WHERE IdProprietario=?', 
                        [id], function(err, rows2, fields) { 
                        if (err)
                            res.json({ erro: "errodb", detalhes: err });
                        else {
                            //Monta as associacoes
                            var associacoes = [];
                            for (var i = 0; i < rows2.length; i++) {
                                associacoes.push({Nome: rows2[i].nome, IdAssociado: rows2[i].idassociado, 
                                    Id: rows2[i].id, Aprovado: rows2[i].aprovado, Chave: rows2[i].chave});
                            }
                            //Retorna os dados 
                            res.json({ok: true, token: token, 
                                usuario: {Telefone: rows[0].Telefone, Nome: rows[0].Nome, Sobrenome: rows[0].Sobrenome, 
                                    Email: rows[0].Email, associacoes: associacoes}, 
                                    publico: JSON.parse(rows[0].Publico)})
                        }
                        
                    })
                else
                    res.json({ erro: "errodb" })
            } else 
                res.json({ erro: "errodb" })
        } );
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
    var Sobrenome = req.body.sobrenome;
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
    if (typeof Sobrenome != "string" || Nome.length < 2) {
        res.json({erro: "nomeinvalido" })
        return;
    }
    //Valida o email
    var usaEmail = (Email != undefined && Email != "" && Email != null)
    if (!usaEmail) Email = null;
    if (usaEmail && (typeof Email != "string" || !validarEmail(Email))) {
        res.json({erro: "emailinvalido" })
        return;
    } 
    //Valida a senha
    if (typeof Senha != "string" || Senha.length < 2) {
        res.json({erro: "senhainvalida" })
        return;
    }
    //Verifica se o email ou telefone estão cadastrados
    db.query("SELECT Id FROM Usuario WHERE Email=? OR Telefone=? AND ConfirmarTelefone IS NULL", [Email, Telefone], 
        function(err, rows, fields) {
        //Se houver algum erro na verificação
        if (err) 
            res.json({erro: "errocriar", detalhes: err })
        else {
            //Se já houver algum usuário registrado com este e-mail ou telefone
            if (rows.length > 0)
                res.json({erro: "existe" })
            else {
                //Não existe, podemos criar
                var confirmarTelefone = gerarSenha(6, true);
                var confirmarEmail = usaEmail ? gerarSenha(4, false) : null;
                criarUsuario(Telefone, Email, Nome, Sobrenome, Senha, 
                    confirmarTelefone, confirmarEmail, function(err, result) {
                    //Ocorreu um erro ao tentar criar
                    if (err)
                        res.json({erro: "errocriar", detalhes: err })
                    else {
                        //Criado, envia email e/ou SMS de confirmação
                        enviarConfirmacao(Nome, Telefone, Email, confirmarTelefone, 
                            confirmarEmail, Lingua, function(ret) { res.json(ret) })                
                    }
                })
            } 
        }
    });
}

/* Envia o email e/ou SMS de confirmação */
function enviarConfirmacao(Nome, Telefone, Email, confirmarTelefone, confirmarEmail, Lingua, callback) {
    //Remove espaço e traço do telefone
    var telefoneFiltrado = Telefone.replaceAll(" ", "").replaceAll("-", "");
    //Envia o SMS
    twilio.sendMessage({
        to:telefoneFiltrado, 
        from: config.twilio.telefone, 
        body: traducao(Lingua, "smsconfirmacao") + confirmarTelefone
    }, function(err, responseData) {
        //Caso tenha ocorrido um erro para enviar o sms
        if (err) 
            callback({erro: "errosms" })
        else {
            //Caso o usuário tenha colocado um email
            if (Email)
                email.enviarEmailTemplate(Email, traducao(Lingua, "emailconfirmacaoassunto"), traducao(Lingua, "emailconfirmacaohtml"), {Nome: Nome,
                    Link: config.vital.base + "servicos/autenticacao/confirmaremail?codigo=" + confirmarEmail + 
                    "&lingua=" + Lingua , Codigo: confirmarEmail, Url: config.vital.base }, callback)
            else
                //Caso contrário retorna que tudo ocorreu bem
                callback({ok: true })
        }            
    });
    
}

/* Atualiza as associações do usuário */
function atualizarAssociacao(id) {
    //Obtém os dados do usuário
    db.query("SELECT Id, Email, Telefone FROM usuario WHERE Id=?", [id], 
        function(err, rows, fields) {
        if (!err && (rows.length > 0)) {
            //Atualiza a tabela de associações com o novo id
            db.query("UPDATE associacao SET IdAssociado=?, NomeAssociado=NULL" +
                " WHERE ConviteChave=? OR ConviteChave=?", [id, rows[0].Email, rows[0].Telefone])
        }
    })
    
}

/* Confirmar telefone */
function confirmarTelefone(req, res) {
    var codigo = req.body.codigo;
    var telefone = req.body.telefone;
    //Procura para verificar se existe
    db.query("SELECT Id FROM Usuario WHERE ConfirmarTelefone=? AND Telefone=?;" + 
        "UPDATE Usuario SET ConfirmarTelefone=NULL WHERE ConfirmarTelefone=? AND Telefone=?", 
        [codigo, telefone, codigo, telefone], function(err, queries, fields) {
            if (err)
                res.json({erro: "erroconfirmar" })
            else if (queries[1].affectedRows == 0) 
                res.json({erro: "codigoinvalido" })
            else if (queries[0].length == 0)
                res.json({erro: "erroconfirmar" })
            else {
                res.json({ok: true });
                atualizarAssociacao(queries[0][0].Id);
            }
        })
}

/* Confirmar email */
function confirmarEmail(req, res) {
    var codigo = req.query.codigo;
    var lingua = req.query.lingua;
    //Procura para verificar se existe
    db.query("SELECT Id FROM Usuario WHERE ConfirmarEmail=?; " +
        "UPDATE Usuario SET ConfirmarEmail=NULL WHERE ConfirmarEmail=?", [codigo, codigo], 
        function(err, queries, fields) {
            if (err)
                res.send(traducao(lingua,"emailconfirmacaoerro"))
            else if (queries[1].affectedRows == 0) 
                res.send(traducao(lingua,"emailconfirmacaoerro"))
            else if (queries[0].length == 0)
                res.send(traducao(lingua,"emailconfirmacaoerro"))
            else {
                res.sendFile(path.join(__dirname, "../templates/") + 
                    traducao(lingua, "emailconfirmacaosucessohtml"));
                atualizarAssociacao(queries[0][0].Id);
            }
        })
}

/* Cria um usuário */
function criarUsuario(telefone, email, nome, sobrenome, senha, confirmarTelefone, confirmarEmail, callback) {
    var item = {
        Telefone: telefone,
        Email: email,
        Nome: nome,
        Sobrenome: sobrenome,
        Senha: senha,
        ConfirmarTelefone: confirmarTelefone, 
        ConfirmarEmail: confirmarEmail
    };
    db.query("INSERT INTO Usuario SET ?", item, callback);
}

/* Gera uma senha aleatória */
function gerarSenha(caracteres, digitos) {
    if (digitos == true)
        return Math.trunc(Math.random() * Math.pow(10, caracteres))
    else
        return crypto.randomBytes(caracteres).toString("hex"); 
}

/* Gera um novo token */
function gerarToken(usuario, dispositivo, lingua, callback) {
    var expira = new Date();
    expira.setHours(expira.getHours() + 1);
    var token = {Id: gerarSenha(28), Lingua: lingua,
        Expira: expira, Usuario: usuario};
    db.query("INSERT INTO Sessao SET ?", token, function(err, result) {
        callback(err, token.Id);
    });
    //Atualiza com a data e horário do último acesso
    db.query("UPDATE Usuario SET Acesso=NOW(), Dispositivo=? WHERE Id=?", [dispositivo, usuario]);
}

/* Validação do login por Mqtt */
function loginMqtt() { 
   console.log("Servidor MQTT iniciado na porta 1883");
   //Função para autenticar
   mqtt.authenticate = function(client, Telefone, Senha, callback) {
        //Executa a query
        db.query('SELECT Id, Senha from Usuario WHERE Telefone=? AND ConfirmarTelefone IS NULL', [Telefone], 
            function(err, rows, fields) {
                var autorizado = (rows.length > 0) && (rows[0].Senha == Senha);
                if (autorizado) client.usuario = rows[0].Id;
                callback(null, autorizado);
            });
   }
   //Permissão para publicar
   mqtt.authorizePublish = function(client, topic, payload, callback) {
        callback(null, client.usuario == topic.split('/')[1]);
   }
   //Permissão para inscrição
   mqtt.authorizeSubscribe = function(client, topic, callback) {
        callback(null, client.usuario == topic.split('/')[1]);
   }
}
    
/* Serviço para login com telefone, retorna token */
function loginTelefone(req, res) {
    //Salva telefone e senha
    var Telefone = req.body.telefone;
    var Senha = req.body.senha;
    var Dispositivo = req.body.dispositivo;
    var Lingua = req.body.lingua;
    if (Telefone == "") {
        res.json({ erro: "semtelefone" });
        return;
    }
    
    //Executa a query
    db.query('SELECT Id, Senha from Usuario WHERE Telefone=? AND ConfirmarTelefone IS NULL', [Telefone], 
        function(err, rows, fields) {
        if (!err) {
            //Senha ou usuário estão incorretos
            if (rows.length == 0) 
                res.json({erro: "usuarionaoencontrado" })
            //Encontrou o usuário, cria o token se a senha estiver correta
            else 
            {
                //Valida se a a senha está correta
                if (rows[0].Senha != Senha) {
                   res.json({ erro: "senhaincorreta" } );
                   return;
                } 
                //Gera o token
                gerarToken(rows[0].Id, Dispositivo, Lingua, function(err, token) {
                    if (err) 
                        res.json({ erro: "erroaogerartoken" } )
                    else
                        retornarUsuario(rows[0].Id, token, req, res)
                });
            }
        }
        else 
            res.json({erro: "errodb", detalhes: err });
    });
}