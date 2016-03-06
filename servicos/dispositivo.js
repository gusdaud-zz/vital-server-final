/* Variáveis compartilhadas */
var db, apn;
/* Módulos usados */
var config = require("../configuracoes");

/* Inicia os serviços de comunicação com dispositio */
exports.iniciar = function(app, _db, express, _apn) {
    //Salva as variáveis
    db = _db;
    apn = _apn;
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
    
    //Prepara as queries
    var queryInserir = "INSERT INTO Dispositivo SET ?;"
    var queryPush = "SELECT Usuario.Id AS Id, Push FROM Associacao LEFT JOIN Usuario ON Associacao.IdProprietario = Usuario.Id WHERE Push <> '' AND Associacao.IdAssociado IN  ( SELECT Id FROM Usuario WHERE Dispositivo = ?);";
    
    //Chama a query SQL
    db.query(queryInserir + queryPush, [inserir, id], 
        function(err, rows, fields) {
        if (err) {
            res.json({erro: "erroatualizar" });
            console.log(err);
        }
        else {
            //Retorna que a atualização foi feita com sucesso
            res.json({ok: true});
            //Notifica a nova localização aos usuário logados através de silent push
            if (rows[1].length == 0) return;
            for (var i in rows[1]) {
                apn.pushNotification({expiry: Math.floor(Date.now() / 1000) + 3600, 
                    "content-available": 1, payload: { 'tipo': "geolocalizacao", 'id': rows[1][i].Id,
                    'latitude': req.body.latitude, 'longitude': req.body.longitude }}, rows[1][i].Push);
            }
        }
    });

}