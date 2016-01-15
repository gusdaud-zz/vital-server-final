/* Função para enviar email */
var config = require("../configuracoes");
var mail = require("nodemailer");
var smtp = require('nodemailer-smtp-transport');
var fs = require('fs');

/* Função para enviar email */
exports.enviarEmail = function(destinatario, assunto, corpo, callback) {
    //Prepara para a comunicação com o SMTP
    var transporter = mail.createTransport(smtp({
        host: config.smtp.servidor,
        port: config.smtp.porta,
        auth: {
            user: config.smtp.usuario,
            pass: config.smtp.senha
        }
    }));
    //Envia o email
    transporter.sendMail({
        from: config.smtp.remetente,
        to: destinatario,
        subject: assunto,
        html: corpo
    }, function(err, response) { 
        if (err)
            callback({erro: "erroenviarmail" })
        else
            callback({ok: true})
    });
}

/* Substitui todas as ocorrências */
function insensitiveReplaceAll(original, find, replace) {
  var str = "",
    remainder = original,
    lowFind = find.toLowerCase(),
    idx;

  while ((idx = remainder.toLowerCase().indexOf(lowFind)) !== -1) {
    str += remainder.substr(0, idx) + replace;

    remainder = remainder.substr(idx + find.length);
  }

  return str + remainder;
}

/* Envia um email com template */
exports.enviarEmailTemplate = function(destinatario, assunto, template, campos, callback) {
    //Carrega o template
    var corpo = fs.readFileSync("./templates/" + template, { encoding: 'utf8' });
    if ((!!campos) && (campos.constructor === Object)) {
        for (var chave in Object.keys(campos)) {
            var nome = Object.keys(campos)[chave]; 
            corpo = insensitiveReplaceAll(corpo, "??" + 
                nome + "??", campos[nome])
        }
    }
    //Chama a função original
    exports.enviarEmail(destinatario, assunto, corpo, callback);
}