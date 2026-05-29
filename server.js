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
    enDescanso: false,
    ganadorRound: null,
    ganadorCombate: null
};

// Registro para coincidencia oficial
let marcasJueces = []; 

io.on('connection', (socket) => {
    socket.emit('actualizar', estado);

    socket.on('toggleTiempo', () => {
        if (estado.ganadorCombate) return;
        estado.corriendo = !estado.corriendo;
        io.emit('actualizar', estado);
    });

    socket.on('configurarTiempos', (datos) => {
        estado.tiempoConfiguradoRound = parseInt(datos.tiempoRound);
        estado.tiempoConfiguradoDescanso = parseInt(datos.tiempoDescanso);
        estado.tiempoRestante = estado.tiempoConfiguradoRound;
        io.emit('actualizar', estado);
    });

    socket.on('modificarMesa', (datos) => {
        if (estado.ganadorCombate) return;
        if (datos.competidor === 'azul') estado.puntosAzul += datos.cantidad;
        else estado.puntosRojo += datos.cantidad;
        io.emit('actualizar', estado);
    });

    socket.on('clickJuez', (datos) => {
        if (!estado.corriendo || estado.enDescanso) return;
        const ahora = Date.now();
        marcasJueces = marcasJueces.filter(m => (ahora - m.timestamp) <= 1000);
        
        const yaVoto = marcasJueces.some(m => m.tecnica === datos.tecnica && m.idJuez === datos.numeroJuez);
        if (!yaVoto) {
            marcasJueces.push({ ...datos, timestamp: ahora });
            const coincidencias = marcasJueces.filter(m => m.competidor === datos.competidor && m.tecnica === datos.tecnica);
            if (coincidencias.length >= 2) {
                if (datos.competidor === 'azul') estado.puntosAzul += (datos.tecnica === 'puno' ? 1 : (datos.tecnica === 'peto' ? 2 : 3));
                else estado.puntosRojo += (datos.tecnica === 'puno' ? 1 : (datos.tecnica === 'peto' ? 2 : 3));
                marcasJueces = [];
                io.emit('actualizar', estado);
            }
        }
    });

    socket.on('reiniciarTodo', () => {
        estado = { ...estado, puntosAzul: 0, puntosRojo: 0, roundsAzul: 0, roundsRojo: 0, roundActual: 1, tiempoRestante: estado.tiempoConfiguradoRound, corriendo: false, enDescanso: false, ganadorRound: null, ganadorCombate: null };
        io.emit('actualizar', estado);
    });
});

setInterval(() => {
    if (estado.corriendo && estado.tiempoRestante > 0) {
        estado.tiempoRestante--;
        io.emit('actualizar', estado);
    }
}, 1000);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Servidor activo'); });
