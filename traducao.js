/* Contém traduções */
var linguas = {
    "en-us": {
        emailconfirmacaoassunto: "Register in Vital",
        emailconfirmacaohtml: "confirmaremail-en.html",
        emailconfirmacaoerro: "There was an error while trying to confirm registration in Vital. " +
            "Please check if the confirmation hasn't being confirmed or expired.",
        emailconfirmacaosucessohtml: "confirmaremailsucesso-en.html",
        smsconfirmacao: "Vital confirmation code: ",
        convite: "The user %s has request your permission to monitor you on Vital" 
    },
    "pt-br": {
        emailconfirmacaoassunto: "Finalizar cadastro no vital",
        emailconfirmacaohtml: "confirmaremail.html",
        emailconfirmacaoerro: "Ocorreu um erro ao tentar confirmar seu registro. " + 
            "Por favor verifique se a confirmação não foi confirmada ou expirou.",
        emailconfirmacaosucessohtml: "confirmaremailsucesso.html",
        smsconfirmacao: "Código de confirmação do Vital: ",
        convite: "O usuário %s pediu sua permissão para lhe monitorar no Vital" 
    }
};

/* Retorna o texto da língua */
module.exports = function(lingua, variavel) {
    //Muda tudo para minúsculo
    if (lingua) lingua = lingua.toLowerCase();
    //Se não reconhecer a língua escolhe o português
    if (linguas[lingua] == undefined) 
        lingua = "pt-br";
    //Se não existir a variável, procura na língua base
    if (linguas[lingua][variavel] == undefined)
        if (linguas["pt-br"][variavel] != undefined)
            lingua = "pt-br"
        else //Se não existir nem na língua base retorna sinal de interrogação
           return "??"; 
    //Retorna a variável
    return linguas[lingua][variavel];
}