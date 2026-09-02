const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configurar la carpeta pública para archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Forzar la ruta raíz a entregar la interfaz visual completa de index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo de WebSockets en tiempo real
io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  socket.on('auth_node', (data) => {
    const { credential } = data;
    if (credential === '197126') {
      socket.emit('auth_success', {
        role: 'DIO_0',
        badge: '★ DIO_0 [VIP X EXTREME ✓]',
        status: 'Authorized Master'
      });
    } else if (credential.length >= 4) {
      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: 'SECURE OPERATOR [VERIFIED ✓]',
        status: 'Authorized Standard'
      });
    } else {
      socket.emit('auth_error', { message: 'Credencial inválida o denegada.' });
    }
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      sender: data.sender || 'Anónimo',
      text: data.text,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on('disconnect', () => {
    console.log(`[SECURE NODE DISCONNECTED]: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Dio3 Secure Node running on port ${PORT}`);
});
