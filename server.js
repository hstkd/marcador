const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let estado = {
    puntosAzul: 0, puntosRojo: 0,
    gamjeomAzul: 0, gamjeomRojo: 0,
    roundsAzul: 0, roundsRojo: 0,
    roundActual: 1,
    tiempoRestante: 120,
    tiempoConfiguradoRound: 120,
    tiempoConfiguradoDescanso: 60,
    corriendo: false,
    enDescanso: false
};

const VALOR_PUNTOS = { 'puno': 1, 'peto': 2, 'cabeza': 3 };

io.on('connection', (socket) => {
    socket.emit('actualizar', estado);

    socket.on('toggleTiempo', () => {
        if (estado.enDescanso) return;
        estado.corriendo = !estado.corriendo;
        io.emit('actualizar', estado);
    });

    socket.on('modificarMesa', (datos) => {
        if (!estado.corriendo || estado.enDescanso) return;
        if (datos.competidor === 'azul') estado.puntosAzul += datos.cantidad;
        else estado.puntosRojo += datos.cantidad;
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('gamjeomMesa', (datos) => {
        if (!estado.corriendo || estado.enDescanso) return;
        if (datos.competidor === 'azul') {
            estado.gamjeomAzul++; estado.puntosRojo += 1;
        } else {
            estado.gamjeomRojo++; estado.puntosAzul += 1;
        }
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('clickJuez', (datos) => {
        if (!estado.corriendo || estado.enDescanso) return;
        
        // MODO DE PRUEBA: Sube directo con 1 solo juez para probar tus 2 celulares hoy
        let puntosASumar = VALOR_PUNTOS[datos.tecnica];
        if (datos.competidor === 'azul') estado.puntosAzul += puntosASumar;
        else estado.puntosRojo += puntosASumar;
        
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });
});

setInterval(() => {
    if (estado.corriendo) {
        if (estado.tiempoRestante > 0) {
            estado.tiempoRestante--;
        } else {
            if (!estado.enDescanso) evaluarGanadorRound();
            else finalizarDescanso();
        }
        io.emit('actualizar', estado);
    }
}, 1000);

function revisarReglasDeVictoria() {
    if (estado.gamjeomAzul >= 5) registrarGanadorRound('rojo');
    if (estado.gamjeomRojo >= 5) registrarGanadorRound('azul');
    if ((estado.puntosAzul - estado.puntosRojo) >= 15) registrarGanadorRound('azul');
    if ((estado.puntosRojo - estado.puntosAzul) >= 15) registrarGanadorRound('rojo');
}

function evaluarGanadorRound() {
    if (estado.puntosAzul > estado.puntosRojo) registrarGanadorRound('azul');
    else if (estado.puntosRojo > estado.puntosAzul) registrarGanadorRound('rojo');
    else registrarGanadorRound('empate');
}

function registrarGanadorRound(ganador) {
    estado.corriendo = false;
    if (ganador === 'azul') estado.roundsAzul++;
    if (ganador === 'rojo') estado.roundsRojo++;

    if (estado.roundsAzul === 2 || estado.roundsRojo === 2) {
        setTimeout(() => { reiniciarCombate(); }, 3000);
    } else {
        estado.enDescanso = true;
        estado.corriendo = true;
        estado.tiempoRestante = estado.tiempoConfiguradoDescanso;
    }
}

function finalizarDescanso() {
    estado.enDescanso = false; estado.corriendo = false; estado.roundActual++;
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

function reiniciarCombate() {
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.roundsAzul = 0; estado.roundsRojo = 0;
    estado.roundActual = 1; estado.enDescanso = false; estado.corriendo = false;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Puerto ' + PORT); });
