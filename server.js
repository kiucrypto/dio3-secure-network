const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir archivos estáticos de forma segura
app.use(express.static(path.join(__dirname, 'public')));

// Ruta comodín para asegurar entrega del frontend en dio3.com
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Núcleo de WebSockets para comunicación efímera y autenticación
io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  // Validación de Jerarquía y Credenciales
  socket.on('auth_node', (data) => {
    const { credential } = data;
    
    if (credential === '197126') {
      socket.emit('auth_success', {
        role: 'DIO_0',
        badge: '★ DIO_0 [VIP X EXTREME ✓]',
        status: 'Authorized Master'
      });
    } else if (credential && credential.length >= 4) {
      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: 'SECURE OPERATOR [VERIFIED ✓]',
        status: 'Authorized Standard'
      });
    } else {
      socket.emit('auth_error', { message: 'Credencial inválida o denegada por el protocolo de seguridad.' });
    }
  });

  // Mensajería efímera de extremo a extremo
  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      sender: data.sender || 'Operador Anónimo',
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
