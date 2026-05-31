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

const VALOR_PUNTOS = { 'puno': 1, 'peto': 2, 'cabeza': 3 };

// Registro para controlar la coincidencia oficial de jueces
let marcasJueces = []; 

//Historial para almacenar estados anteriores
let historialAcciones = [];

io.on('connection', (socket) => {
    socket.emit('actualizar', estado);

    socket.on('toggleTiempo', () => {
        if (estado.enDescanso || estado.ganadorCombate || estado.ganadorRound === 'empate') return;
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
        if (estado.corriendo || estado.ganadorCombate || estado.ganadorRound === 'empate') return;
        guardarEstadoEnHistorial();
        if (datos.competidor === 'azul') estado.puntosAzul += datos.cantidad;
        else estado.puntosRojo += datos.cantidad;
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    socket.on('gamjeomMesa', (datos) => {
        if (estado.corriendo || estado.ganadorCombate || estado.ganadorRound === 'empate') return;
        guardarEstadoEnHistorial();
        if (datos.competidor === 'azul') {
            estado.gamjeomAzul++; estado.puntosRojo += 1;
        } else {
            estado.gamjeomRojo++; estado.puntosAzul += 1;
        }
        revisarReglasDeVictoria();
        io.emit('actualizar', estado);
    });

    // --- CLIC DE EMPATE SIN RESTRICCIÓN DE CONTRASEÑA ---
    socket.on('resolverEmpateRound', (datos) => {
        if (estado.ganadorRound === 'empate') {
            console.log(`[MESA] Empate resuelto libremente. Ganador: ${datos.ganador}`);
            
            // 1. Asignamos el ganador del round directamente
            estado.ganadorRound = datos.ganador;
            
            // 2. Sumamos el round al marcador del competidor
            if (datos.ganador === 'azul') estado.roundsAzul++;
            if (datos.ganador === 'rojo') estado.roundsRojo++;

            // Enviar cambio inmediato a las pantallas
            io.emit('actualizar', estado);

            // 3. Evaluamos si termina el combate completo o vamos a descanso
            if (estado.roundsAzul === 2) {
                estado.ganadorCombate = 'azul';
                estado.corriendo = false;
                io.emit('actualizar', estado);
            } else if (estado.roundsRojo === 2) {
                estado.ganadorCombate = 'rojo';
                estado.corriendo = false;
                io.emit('actualizar', estado);
            } else {
                // Si van 1-1, esperamos 3 segundos mostrando quién ganó el round y pasamos al descanso
                setTimeout(() => {
                    estado.ganadorRound = null;
                    estado.enDescanso = true;
                    estado.tiempoRestante = estado.tiempoConfiguradoDescanso;
                    estado.corriendo = true; // El cronómetro arranca para contar el descanso
                    io.emit('actualizar', estado);
                }, 3000);
            }
        }
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
                guardarEstadoEnHistorial();
                if (competidor === 'azul') estado.puntosAzul += puntosASumar;
                else estado.puntosRojo += puntosASumar;

                marcasJueces = marcasJueces.filter(m => !(m.competidor === competidor && m.tecnica === tecnica));
                revisarReglasDeVictoria();
                io.emit('actualizar', estado);
            }
        }
    });

         // --- MANEJADOR DE UNDO BLINDADO PARA PRODUCCIÓN ---
    socket.on('deshacerUltimaAccion', () => {
        if (historialAcciones.length > 0) {
            const estadoAnterior = historialAcciones.pop();
            
            // En lugar de reasignar el objeto completo, copiamos sus valores internos
            Object.assign(estado, estadoAnterior);
            
            console.log("[MESA] UNDO ejecutado con éxito.");
            io.emit('actualizar', estado);
        } else {
            console.log("[MESA] No hay acciones en el historial para deshacer.");
        }
    });

    socket.on('reiniciarTodo', () => {

    socket.on('reiniciarTodo', () => {
        reiniciarCombate();
        marcasJueces = [];
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
    if (estado.puntosAzul > estado.puntosRojo) {
        registrarGanadorRound('azul');
    } else if (estado.puntosRojo > estado.puntosAzul) {
        registrarGanadorRound('rojo');
    } else {
        // Congela el combate en empate y espera el botón de la mesa libremente
        estado.corriendo = false; 
        estado.ganadorRound = 'empate';
    }
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
    estado.enConsancio = false; 
    estado.enDescanso = false; 
    estado.corriendo = false; 
    estado.roundActual++;
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

function reiniciarCombate() {
    historialAcciones = [];
    estado.puntosAzul = 0; estado.puntosRojo = 0;
    estado.gamjeomAzul = 0; estado.gamjeomRojo = 0;
    estado.roundsAzul = 0; estado.roundsRojo = 0;
    estado.roundActual = 1; 
    estado.enDescanso = false; estado.corriendo = false;
    estado.ganadorRound = null; estado.ganadorCombate = null;
    estado.tiempoRestante = estado.tiempoConfiguradoRound;
}

function guardarEstadoEnHistorial() {
    // Clonamos el estado actual para que no se modifique por referencia
    historialAcciones.push(JSON.parse(JSON.stringify(estado)));
    // Si el historial es muy largo, borramos el más antiguo
    if (historialAcciones.length > 20) historialAcciones.shift();
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Puerto ' + PORT); });
