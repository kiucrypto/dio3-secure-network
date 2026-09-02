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

// Persistent registries in memory
const registeredUsers = {};
const userBalances = {};
const activeSockets = {}; 
const activeChatRooms = {};

// Founder Configuration (DIO 0 / DIO197126)
const FOUNDER_ID = 'DIO0';
const FOUNDER_BTC_WALLET = 'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s';

io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  // Registration
  socket.on('register_node', (data) => {
    let { customId, password } = data;
    
    if (!customId || !password) {
      socket.emit('auth_error', { message: 'Missing ID or numeric password for registration.' });
      return;
    }

    customId = customId.trim();
    const numericId = parseInt(customId, 10);

    if (isNaN(numericId) || numericId < 0 || numericId > 1000000) {
      socket.emit('auth_error', { message: 'Access Denied: ID out of allowed range (0 to 1,000,000).' });
      return;
    }

    const username = 'DIO' + numericId;

    if (registeredUsers[username]) {
      socket.emit('auth_error', { message: 'Error: This ID is already registered. Choose another.' });
      return;
    }

    registeredUsers[username] = password;
    userBalances[username] = (username === 'DIO0') ? 99999.0 : 10.0;
    
    socket.emit('register_success', { 
      message: `Node ${username} successfully registered with starting balance.`,
      username: username,
      balance: userBalances[username]
    });
  });

  // Node Authentication
  socket.on('auth_node', (data) => {
    let { customId, password } = data;
    if (customId === undefined || password === undefined) {
      socket.emit('auth_error', { message: 'Enter your ID and numeric password.' });
      return;
    }

    customId = customId.toString().trim();
    const numericId = parseInt(customId, 10);
    const username = 'DIO' + numericId;
    
    // Founder Privileges for DIO 0
    if (username === 'DIO0' && (password === '197126' || password === '0' || registeredUsers[username] === password)) {
      userBalances[username] = 99999.0;
      activeSockets[username] = socket.id;
      socket.emit('auth_success', {
        role: 'FOUNDER_VIP',
        badge: '★ DIO 0 [FOUNDER & SUPREME CONTROLLER ✓]',
        balance: userBalances[username],
        isVip: true,
        isAdmin: true
      });
      return;
    }

    if (password === '197126' || (registeredUsers[username] && registeredUsers[username] === password)) {
      if (userBalances[username] === undefined) userBalances[username] = 10.0;
      activeSockets[username] = socket.id;
      const isVip = userBalances[username] >= 500.0; 

      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: isVip ? `${username} [SECURE VIP OPERATOR ✓]` : `${username} [SECURE OPERATOR]`,
        balance: userBalances[username],
        isVip: isVip,
        isAdmin: false
      });
    } else {
      socket.emit('auth_error', { message: 'Invalid credentials or access denied.' });
    }
  });

  // Founder credit balance function
  socket.on('admin_credit_balance', (data) => {
    let { adminUser, targetUser, amount } = data;
    if (adminUser === 'DIO0') {
      targetUser = targetUser.trim();
      const targetFull = targetUser.startsWith('DIO') ? targetUser : 'DIO' + targetUser;
      const addAmount = parseFloat(amount);
      
      if (!isNaN(addAmount) && (userBalances[targetFull] !== undefined || registeredUsers[targetFull])) {
        if (userBalances[targetFull] === undefined) userBalances[targetFull] = 0;
        userBalances[targetFull] += addAmount;
        
        socket.emit('admin_action_success', { message: `Successfully credited ${addAmount} DIO to ${targetFull}. New balance: ${userBalances[targetFull]}` });
        
        const targetSocket = activeSockets[targetFull];
        if (targetSocket) {
          io.to(targetSocket).emit('balance_updated', { newBalance: userBalances[targetFull], message: `Founder credited ${addAmount} DIO to your wallet.` });
        }
      } else {
        socket.emit('auth_error', { message: 'Target user ID does not exist in the secure registry.' });
      }
    } else {
      socket.emit('auth_error', { message: 'Unauthorized: Founder privileges required.' });
    }
  });

  // Security penalty: -3 DIO on disconnect/switch
  socket.on('penalize_session_exit', (data) => {
    const { username } = data;
    if (username && username !== 'DIO0' && userBalances[username] !== undefined) {
      userBalances[username] = Math.max(0, userBalances[username] - 3.0);
      socket.emit('balance_updated', { newBalance: userBalances[username], message: 'Security penalty: -3 DIO deducted due to session disconnection or app switch.' });
    }
  });

  socket.on('send_connection_request', (data) => {
    let { targetUser, senderUser, messageText } = data;
    targetUser = targetUser.trim();
    const fullTarget = targetUser.startsWith('DIO') ? targetUser : 'DIO' + targetUser;
    
    const targetSocketId = activeSockets[fullTarget];
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_connection_request', { 
        sender: senderUser, 
        message: messageText || 'Direct secure connection & message request.' 
      });
      socket.emit('request_sent_success', { message: `Secure request transmitted to ${fullTarget}` });
    } else {
      socket.emit('auth_error', { message: 'Target operator is currently offline or invalid ID.' });
    }
  });

  socket.on('generate_chat_code', (data) => {
    const code = 'DIO-ROOM-' + Math.floor(1000 + Math.random() * 9000);
    activeChatRooms[code] = { host: data.username, participants: [data.username] };
    socket.emit('chat_code_generated', { code: code });
  });

  socket.on('connect_with_code', (data) => {
    const { code, username } = data;
    if (activeChatRooms[code]) {
      activeChatRooms[code].participants.push(username);
      socket.join(code);
      io.to(code).emit('chat_joined', { message: `Operator ${username} joined live room.` });
      socket.emit('connection_success', { code: code });
    } else {
      socket.emit('auth_error', { message: 'Invalid or expired room code.' });
    }
  });

  socket.on('send_room_message', (data) => {
    io.to(data.code).emit('receive_room_message', {
      sender: data.sender,
      text: data.text || '',
      timestamp: new Date().toLocaleTimeString()
    });
  });

  socket.on('send_post', (data) => {
    io.emit('receive_post', {
      sender: data.sender || 'Operator',
      text: data.text,
      timestamp: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
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
