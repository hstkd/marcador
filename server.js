const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

// --- SEGURIDAD: CONFIGURA TUS CLAVES AQUÍ ---
const CLAVE_MESA = "ADMIN123";
const CLAVE_JUEZ = "JUEZ789";

let estado = {
    puntosAzul: 0, puntosRojo: 0, gamjeomAzul: 0, gamjeomRojo: 0,
    roundsAzul: 0, roundsRojo: 0, roundActual: 1,
    tiempoRestante: 120, tiempoConfiguradoRound: 120, tiempoConfiguradoDescanso: 60,
    corriendo: false, enDescanso: false, ganadorRound: null, ganadorCombate: null
};

const VALOR_PUNTOS = { 'puno': 1, 'peto': 2, 'cabeza': 3 };
let marcasJueces = []; 

io.on('connection', (socket) => {
    socket.emit('actualizar', estado);

    // --- NUEVO: Lógica de Autenticación ---
    socket.on('autenticar', (datos) => {
        if (datos.tipo === 'mesa' && datos.pass === CLAVE_MESA) {
            socket.join('admin');
            socket.emit('authStatus', { ok: true, rol: 'mesa' });
        } else if (datos.tipo === 'juez' && datos.pass === CLAVE_JUEZ) {
            socket.join('jueces');
            socket.emit('authStatus', { ok: true, rol: 'juez' });
        } else {
            socket.emit('authStatus', { ok: false });
        }
    });

    socket.on('toggleTiempo', () => {
        if (!socket.rooms.has('admin')) return; // Bloqueo de seguridad
        if (estado.enDescanso || estado.ganadorCombate) return;
        estado.corriendo = !estado.corriendo;
        io.emit('actualizar', estado);
    });

    socket.on('configurarTiempos', (datos) => {
        if (!socket.rooms.has('admin')) return; // Bloqueo de seguridad
        if (estado.corriendo || estado.roundActual > 1 || estado.puntosAzul > 0 || estado.puntosRojo > 0) return;
        estado.tiempoConfiguradoRound = parseInt(datos.tiempoRound);
        estado.tiempoConfiguradoDescanso = parseInt(datos.tiempoDescanso);
        estado.tiempoRestante = estado.tiempoConfiguradoRound;
        io.emit('actualizar', estado);
    });

    socket.on('modificarMesa', (datos) => {
        if (!socket.rooms.has('admin')) return; // Bloqueo de seguridad
        if (estado.corriendo || estado.ganadorCombate) return;
        if (datos.competidor === 'azul') estado.puntosAzul += datos.cantidad;
        else estado.puntosRojo += datos.cantidad;
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('gamjeomMesa', (datos) => {
        if (!socket.rooms.has('admin')) return; // Bloqueo de seguridad
        if (estado.corriendo || estado.ganadorCombate) return;
        if (datos.competidor === 'azul') { estado.gamjeomAzul++; estado.puntosRojo += 1; } 
        else { estado.gamjeomRojo++; estado.puntosAzul += 1; }
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('clickJuez', (datos) => {
        if (!socket.rooms.has('jueces')) return; // Bloqueo de seguridad
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
        if (!socket.rooms.has('admin')) return; // Bloqueo de seguridad
        reiniciarCombate();
        marcasJueces = [];
        io.emit('actualizar', estado);
    });
});

// ... (El resto de tus funciones como setInterval, revisarReglasDeVictoria, etc. se mantienen IGUAL)

function revisarReglasDeVictoria() { /* ... */ }
function evaluarGanadorRound() { /* ... */ }
function registrarGanadorRound(ganador) { /* ... */ }
function finalizarDescanso() { /* ... */ }
function reiniciarCombate() { /* ... */ }

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Puerto ' + PORT); });
