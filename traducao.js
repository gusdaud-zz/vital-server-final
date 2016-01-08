/* Contém traduções */
var linguas = {
    "en": {
        emailconfirmacaoassunto: "Register in Vital",
        emailconfirmacaohtml: "confirmaremail-en.html",
        emailconfirmacaoerro: "There was an error while trying to confirm registration in Vital. " +
            "Please check if the confirmation hasn't being confirmed or expired.",
        emailconfirmacaosucessohtml: "confirmaremailsucesso-en.html" 
    },
    "pt-br": {
        emailconfirmacaoassunto: "Finalizar cadastro no vital",
        emailconfirmacaohtml: "confirmaremail.html",
        emailconfirmacaoerro: "Ocorreu um erro ao tentar confirmar seu registro. " + 
            "Por favor verifique se a confirmação não foi confirmada ou expirou.",
        emailconfirmacaosucessohtml: "confirmaremailsucesso.html" 
    }
};

/* Retorna o texto da língua */
module.exports = function(lingua, variavel) {
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