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

// Memoria segura de usuarios registrados (Fundador: Lenox JG - 2026-09-02)
const registeredUsers = {};

io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  // Registro con validación para evitar duplicados
  socket.on('register_node', (data) => {
    const { username, password } = data;
    if (username && password) {
      if (registeredUsers[username]) {
        socket.emit('auth_error', { message: 'Error: User ID already exists. Cannot overwrite active credentials.' });
        return;
      }
      registeredUsers[username] = password;
      socket.emit('register_success', { 
        message: 'Secure node account created successfully. Save your credentials.',
        username: username 
      });
    } else {
      socket.emit('auth_error', { message: 'Missing data for registration.' });
    }
  });

  // Autenticación de acceso
  socket.on('auth_node', (data) => {
    const { username, password } = data;
    
    // Llave maestra absoluta del fundador Lenox JG
    if (username === 'DIO197126' && password === '197126') {
      socket.emit('auth_success', {
        role: 'DIO_0',
        badge: '★ DIO_0 [VIP X EXTREME ✓]',
        status: 'Authorized Master - Founder Lenox JG'
      });
      return;
    }

    if (password === '197126' || (registeredUsers[username] && registeredUsers[username] === password)) {
      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: 'SECURE OPERATOR [VERIFIED ✓]',
        status: 'Authorized Standard'
      });
    } else {
      socket.emit('auth_error', { message: 'Invalid credentials or access denied.' });
    }
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      sender: data.sender || 'Operator',
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
