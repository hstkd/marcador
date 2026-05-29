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
    ganadorCombate: null,
    // Nombres predeterminados
    nombreAzul: "CHONG",
    nombreRojo: "HONG",
    // Control de jueces conectados
    juecesOcupados: { 1: false, 2: false, 3: false }
};

const VALOR_PUNTOS = { 'puno': 1, 'peto': 2, 'cabeza': 3 };
let marcasJueces = []; 

io.on('connection', (socket) => {
    let juezAsignado = null;

    // Enviar estado inicial al conectar
    socket.emit('actualizar', estado);
    socket.emit('juecesOcupados', estado.juecesOcupados);

    // Intentar ocupar un puesto de juez
    socket.on('solicitarPuestoJuez', (numero) => {
        const num = parseInt(numero);
        if (!estado.juecesOcupados[num]) {
            // Si el cliente ya tenía un puesto, lo liberamos primero
            if (juezAsignado) {
                estado.juecesOcupados[juezAsignado] = false;
            }
            juezAsignado = num;
            estado.juecesOcupados[num] = true;
            socket.emit('puestoAsignadoExito', num);
        } else {
            socket.emit('puestoOcupadoError');
        }
        io.emit('juecesOcupados', estado.juecesOcupados);
    });

    // Actualizar nombres desde la mesa central
    socket.on('actualizarNombres', (datos) => {
        estado.nombreAzul = datos.azul.toUpperCase() || "CHONG";
        estado.nombreRojo = datos.rojo.toUpperCase() || "HONG";
        io.emit('actualizar', estado);
    });

    socket.on('toggleTiempo', () => {
        if (estado.enDescanso || estado.ganadorCombate) return;
        estado.corriendo = !estado.corriendo;
        io.emit('actualizar', estado);
    });

    socket.on('configurarTiempos', (datos) => {
        if (estado.corriendo || estado.roundActual > 1 || estado.puntosAzul > 0 || estado.puntosRojo > 0) return;
        estado.tiempoConfiguradoRound = parseInt(datos.tiempoRound);
        estado.tiempoConfiguradoDescanso = parseInt(datos.tiempoDescanso);
        estado.tiempoRestante = estado.tiempoConfiguradoRound;
        io.emit('actualizar', estado);
    });

    socket.on('modificarMesa', (datos) => {
        if (estado.corriendo || estado.ganadorCombate) return;
        if (datos.competidor === 'azul') estado.puntosAzul += datos.cantidad;
        else estado.puntosRojo += datos.cantidad;
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('gamjeomMesa', (datos) => {
        if (estado.corriendo || estado.ganadorCombate) return;
        if (datos.competidor === 'azul') {
            estado.gamjeomAzul++; estado.puntosRojo += 1;
        } else {
            estado.gamjeomRojo++; estado.puntosAzul += 1;
        }
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('clickJuez', (datos) => {
        if (!estado.corriendo || estado.enDescanso || estado.ganadorCombate) return;
        const ahora = Date.now();
        const { competidor, tecnica, numeroJuez } = datos;

        marcasJueces = marcasJueces.filter(m => (ahora - m.timestamp) <= 1000);
        const yaVoto = marcasJueces.some(m => m.competidor === competidor && m.tecnica === tecnica && m.idJuez === numeroJuez);
        
        if (!yaVoto) {
            marcasJueces.push({ competidor, tecnica, idJuez: numeroJuez, timestamp: ahora });
            const coincidencias = marcasJueces.filter(m => m.competidor === competidor && m.tecnica === tecnica);

            if (coincidencias.length >= 2) {
                let puntosASumar = VALOR_PUNTOS[tecnica];
                if (competidor === 'azul') estado.puntosAzul += puntosASumar;
                else estado.puntosRojo += puntosASumar;

                marcasJueces = marcasJueces.filter(m => !(m.competidor === competidor && m.tecnica === tecnica));
                revisarReglasDeVictoria();
                io.emit('actualizar', estado);
            }
        }
    });

    socket.on('reiniciarTodo', () => {
        reiniciarCombate();
        marcasJueces = [];
        io.emit('actualizar', estado);
    });

    // Al desconectarse un celular de juez, liberamos su puesto automáticamente
    socket.on('disconnect', () => {
        if (juezAsignado) {
            estado.juecesOcupados[juezAsignado] = false;
            io.emit('juecesOcupados', estado.juecesOcupados);
        }
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
    estado.ganadorRound = ganador;

    if (ganador === 'azul') estado.roundsAzul++;
    if (ganador === 'rojo') estado.roundsRojo++;

    if (estado.roundsAzul === 2) {
        estado.ganadorCombate = 'azul';
    } else if (estado.roundsRojo === 2) {
        estado.ganadorCombate = 'rojo';
    } else {
        setTimeout(() => {
            estado.ganadorRound = null;
            estado.enDescanso = true;
            estado.corriendo = true;
            estado.tiempoRestante = estado.tiempoConfiguradoDescanso;
            io.emit('actualizar', estado);
        }, 4000); 
    }
}

function finalizarDescanso() {
    estado.enDescanso = false; 
    estado.corriendo = false; 
    estado.roundActual++;
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

function reiniciarCombate() {
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.roundsAzul = 0; estado.roundsRojo = 0;
    estado.roundActual = 1; 
    estado.enDescanso = false; estado.corriendo = false;
    estado.ganadorRound = null; estado.ganadorCombate = null;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Puerto ' + PORT); });
