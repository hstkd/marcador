const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let estado = {
    puntosAzul: 0, puntosRojo: 0, tiempoRestante: 120, 
    corriendo: false, tiempoConfigurado: 120
};

let marcasJueces = [];
let juecesBloqueados = new Set();

io.on('connection', (socket) => {
    socket.emit('actualizar', estado);

    socket.on('registrarJuez', (num) => {
        if (!juecesBloqueados.has(num)) {
            juecesBloqueados.add(num);
            socket.emit('juezRegistrado', true);
        } else {
            socket.emit('juezRegistrado', false);
        }
    });

    socket.on('toggleTiempo', () => {
        estado.corriendo = !estado.corriendo;
        io.emit('actualizar', estado);
    });

    socket.on('configurarTiempos', (d) => {
        estado.tiempoConfigurado = parseInt(d.tiempo);
        estado.tiempoRestante = estado.tiempoConfigurado;
        io.emit('actualizar', estado);
    });

    socket.on('clickJuez', (d) => {
        if (!estado.corriendo) return;
        const ahora = Date.now();
        marcasJueces = marcasJueces.filter(m => (ahora - m.timestamp) <= 1000);
        
        if (!marcasJueces.some(m => m.idJuez === d.idJuez)) {
            marcasJueces.push({ ...d, timestamp: ahora });
            let coincidencias = marcasJueces.filter(m => m.competidor === d.competidor && m.tecnica === d.tecnica);
            if (coincidencias.length >= 2) {
                if (d.competidor === 'azul') estado.puntosAzul += (d.tecnica === 'puno' ? 1 : 2);
                else estado.puntosRojo += (d.tecnica === 'puno' ? 1 : 2);
                marcasJueces = [];
                io.emit('actualizar', estado);
            }
        }
    });
});

setInterval(() => {
    if (estado.corriendo && estado.tiempoRestante > 0) {
        estado.tiempoRestante--;
        io.emit('actualizar', estado);
    }
}, 1000);

http.listen(process.env.PORT || 3000);
