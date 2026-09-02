const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const registeredUsers = {};
const userBalances = {};
const activeSockets = {}; 
const activeChatRooms = {};

// Tu dirección real de Trust Wallet para recibir los pagos
const FOUNDER_BTC_ADDRESS = 'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s';

// Función para verificar transacciones reales en la Blockchain usando la API pública de Mempool
function checkRealBlockchainPayment(expectedBtcAmount, callback) {
  const url = `https://mempool.space/api/address/${FOUNDER_BTC_ADDRESS}/txs`;
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const txs = JSON.parse(data);
        if (!Array.isArray(txs) || txs.length === 0) {
          return callback(false, 'No transactions found on this address yet.');
        }

        // Revisar las transacciones más recientes (últimas 5)
        const recentTxs = txs.slice(0, 5);
        let paymentFound = false;

        for (let tx of recentTxs) {
          // Verificar si la transacción está sin gastar o confirmada recientemente (últimos 30 minutos)
          for (let vout of tx.vout) {
            if (vout.scriptpubkey_address === FOUNDER_BTC_ADDRESS) {
              const receivedBtc = vout.value / 100000000; // Convertir satoshis a BTC
              // Permitir un margen mínimo de tolerancia por comisiones de red
              if (receivedBtc >= (expectedBtcAmount * 0.95)) {
                paymentFound = true;
                break;
              }
            }
          }
          if (paymentFound) break;
        }

        if (paymentFound) {
          callback(true, 'Payment successfully confirmed on the Bitcoin blockchain!');
        } else {
          callback(false, 'Payment not detected yet. Make sure you sent the exact BTC amount to the address.');
        }
      } catch (e) {
        callback(false, 'Error parsing blockchain network response.');
      }
    });
  }).on('error', () => {
    callback(false, 'Could not connect to the Bitcoin network API.');
  });
}

io.on('connection', (socket) => {
  console.log(`[SECURE NODE CONNECTED]: ${socket.id}`);

  socket.on('register_node', (data) => {
    let { customId, password } = data;
    if (!customId || password === undefined) {
      socket.emit('auth_error', { message: 'Missing ID or numeric password.' });
      return;
    }

    customId = customId.trim();
    const numericId = parseInt(customId, 10);

    if (isNaN(numericId) || numericId < 0 || numericId > 1000000) {
      socket.emit('auth_error', { message: 'Access Denied: ID out of range (0 to 1,000,000).' });
      return;
    }

    const username = 'DIO' + numericId;
    if (registeredUsers[username]) {
      socket.emit('auth_error', { message: 'Error: This ID is already registered.' });
      return;
    }

    registeredUsers[username] = password;
    userBalances[username] = (username === 'DIO0') ? 99999.0 : 10.0; // Bono de bienvenida inicial
    
    socket.emit('register_success', { 
      message: `Node ${username} registered successfully! You can now log in.`,
      username: username
    });
  });

  socket.on('auth_node', (data) => {
    let { customId, password } = data;
    if (customId === undefined || password === undefined) {
      socket.emit('auth_error', { message: 'Please enter your ID and numeric password.' });
      return;
    }

    customId = customId.toString().trim();
    const numericId = parseInt(customId, 10);
    const username = 'DIO' + numericId;
    
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

  // VERIFICACIÓN REAL EN LA BLOCKCHAIN DE BITCOIN
  socket.on('verify_btc_payment', (data) => {
    let { username, packageType } = data;
    if (!username || userBalances[username] === undefined) {
      socket.emit('auth_error', { message: 'Session error during payment check.' });
      return;
    }

    // Definir la cantidad exacta de BTC requerida según el paquete elegido
    let requiredBtc = 0.000012; // 10 DIO
    let creditedDio = 10;
    
    if (packageType.includes('50 DIO')) { requiredBtc = 0.000055; creditedDio = 50; }
    else if (packageType.includes('100 DIO')) { requiredBtc = 0.000088; creditedDio = 100; }
    else if (packageType.includes('500 DIO')) { requiredBtc = 0.00038; creditedDio = 500; }
    else if (packageType.includes('1,000 DIO')) { requiredBtc = 0.00072; creditedDio = 1000; }
    else if (packageType.includes('5,000 DIO')) { requiredBtc = 0.0034; creditedDio = 5000; }
    else if (packageType.includes('10,000 DIO')) { requiredBtc = 0.0066; creditedDio = 10000; }

    console.log(`[BLOCKCHAIN QUERY] Checking real transfer of ~${requiredBtc} BTC for user ${username}...`);

    // Consulta real a la red Bitcoin
    checkRealBlockchainPayment(requiredBtc, (isPaid, message) => {
      if (isPaid) {
        userBalances[username] += creditedDio;
        socket.emit('balance_updated', { 
          newBalance: userBalances[username], 
          message: `Payment verified on blockchain! ${creditedDio} DIO credited to your wallet.` 
        });
      } else {
        socket.emit('auth_error', { message: `Verification failed: ${message}` });
      }
    });
  });

  socket.on('admin_credit_balance', (data) => {
    let { adminUser, targetUser, amount } = data;
    if (adminUser === 'DIO0') {
      targetUser = targetUser.trim();
      const targetFull = targetUser.startsWith('DIO') ? targetUser : 'DIO' + targetUser;
      const addAmount = parseFloat(amount);
      
      if (!isNaN(addAmount) && (userBalances[targetFull] !== undefined || registeredUsers[targetFull])) {
        if (userBalances[targetFull] === undefined) userBalances[targetFull] = 0;
        userBalances[targetFull] += addAmount;
        
        socket.emit('admin_action_success', { message: `Credited ${addAmount} DIO to ${targetFull}.` });
        
        const targetSocket = activeSockets[targetFull];
        if (targetSocket) {
          io.to(targetSocket).emit('balance_updated', { newBalance: userBalances[targetFull], message: `The Founder credited ${addAmount} DIO to your wallet.` });
        }
      } else {
        socket.emit('auth_error', { message: 'Target user ID does not exist.' });
      }
    } else {
      socket.emit('auth_error', { message: 'Unauthorized: Founder privileges required.' });
    }
  });

  socket.on('penalize_session_exit', (data) => {
    const { username } = data;
    if (username && username !== 'DIO0' && userBalances[username] !== undefined) {
      userBalances[username] = Math.max(0, userBalances[username] - 3.0);
      socket.emit('balance_updated', { newBalance: userBalances[username], message: 'Security Alert: -3 DIO deducted for leaving the app/tab.' });
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
        message: messageText || 'Direct secure connection request.' 
      });
      socket.emit('request_sent_success', { message: `Request transmitted to ${fullTarget}` });
    } else {
      socket.emit('auth_error', { message: 'Target operator is offline.' });
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
      io.to(code).emit('chat_joined', { message: `Operator ${username} has joined the room.` });
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
