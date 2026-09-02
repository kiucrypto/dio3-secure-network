const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Base de datos temporal en memoria para usuarios registrados en el nodo
const registeredUsers = {};

io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  // Registro de nuevo usuario (9 dígitos aleatorios + contraseña)
  socket.on('register_node', (data) => {
    const { username, password } = data;
    if (username && password) {
      registeredUsers[username] = password;
      socket.emit('register_success', { 
        message: 'Nodo de usuario creado con éxito. Guárdalo bien.',
        username: username 
      });
    } else {
      socket.emit('auth_error', { message: 'Faltan datos para el registro.' });
    }
  });

  // Autenticación de acceso
  socket.on('auth_node', (data) => {
    const { username, password } = data;
    
    // Llave maestra absoluta
    if (username === 'DIO197126' && password === '197126') {
      socket.emit('auth_success', {
        role: 'DIO_0',
        badge: '★ DIO_0 [VIP X EXTREME ✓]',
        status: 'Authorized Master'
      });
      return;
    }

    // Validación de usuarios registrados o clave maestra directa
    if (password === '197126' || (registeredUsers[username] && registeredUsers[username] === password)) {
      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: 'SECURE OPERATOR [VERIFIED ✓]',
        status: 'Authorized Standard'
      });
    } else {
      socket.emit('auth_error', { message: 'Credenciales inválidas o acceso denegado.' });
    }
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      sender: data.sender || 'Operador DIO',
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
