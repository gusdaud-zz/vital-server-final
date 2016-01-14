/* Variáveis compartilhadas */
var db;
/* Módulos usados */
var config = require("../configuracoes");

/* Inicia os serviços de comunicação com dispositio */
exports.iniciar = function(app, _db, express) {
    //Salva a variável
    db = _db;
    //Registra os serviços
    app.post('/servicos/dispositivo/atualizar', atualizarDispositivo);
    //Agora e a cada 6 horas limpas as atualizações antigas
    setInterval(limparAtualizacoes, 1000 * 60 * 60 * 6);
    limparAtualizacoes();
}

/* Limpa as atualizações antigas */
function limparAtualizacoes() {
    db.query('DELETE FROM Dispositivo WHERE Atualizacao < (NOW() - INTERVAL 7 DAY)')
}

/* Atualiza as informações do dispositivo */
function atualizarDispositivo(req, res) {
    //Valida as variáveis
    var id = req.body.id;
    if (id == undefined || id == null) {
        res.json({erro: "faltouid" });
        return;
    }
    //Prepara o objeto de atualização
    var inserir = {Id: id};
    if (req.body.latitude) inserir.Latitude = req.body.latitude;
    if (req.body.longitude) inserir.Longitude = req.body.longitude;
    if (req.body.bateria) inserir.Bateria = req.body.bateria;
    //Chama a query SQL
    db.query("INSERT INTO Dispositivo SET ?", inserir, 
        function(err, result) {
        if (err) 
            res.json({erro: "erroatualizar" })
        else 
            res.json({ok: true});
    });

}