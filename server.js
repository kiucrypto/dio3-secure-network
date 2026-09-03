const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10 * 1024 * 1024 });

app.set('trust proxy', true);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Estructuras de seguridad estrictas (Listas Negras Definitivas)
const registeredUsers = {};          // username -> { password, createdAt, lastLogin, fingerprint, ip }
const userBalances = {};             // username -> balance
const bannedDeviceFingerprints = new Set(); // Huellas de hardware únicas bloqueadas permanentemente
const bannedIPs = new Set();               // Direcciones IP / Redes WiFi bloqueadas para registros
const activeSockets = {};            // username -> socket.id
const privateMessageHistory = {};    // roomId -> array of messages

const FOUNDER_BTC_ADDRESS = 'bc1qep3ntxf6lz037ny04706u88jsl364p0ny4776s';

// Tarea automática: Inactividad de 3 días o liberación a los 9 días (UX0 y DIO0 protegidos)
setInterval(() => {
  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const NINE_DAYS = 9 * 24 * 60 * 60 * 1000;

  for (const [username, data] of Object.entries(registeredUsers)) {
    if (username === 'UX0' || username === 'DIO0') continue;

    const timeSinceLastActivity = now - (data.lastLogin || data.createdAt);
    const timeSinceCreation = now - data.createdAt;

    if (timeSinceLastActivity > THREE_DAYS) {
      delete registeredUsers[username];
      delete userBalances[username];
    }

    if (timeSinceCreation > NINE_DAYS) {
      delete registeredUsers[username];
      delete userBalances[username];
    }
  }
}, 60 * 60 * 1000);

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

        const recentTxs = txs.slice(0, 5);
        let paymentFound = false;

        for (let tx of recentTxs) {
          for (let vout of tx.vout) {
            if (vout.scriptpubkey_address === FOUNDER_BTC_ADDRESS) {
              const receivedBtc = vout.value / 100000000;
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
          callback(false, 'Payment not detected yet.');
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
  const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '';
  const clientIp = rawIp.split(',')[0].trim();

  socket.on('check_security_status', (data) => {
    const { deviceFingerprint } = data || {};
    if ((clientIp && bannedIPs.has(clientIp)) || (deviceFingerprint && bannedDeviceFingerprints.has(deviceFingerprint))) {
      socket.emit('security_lockout', { message: 'CRITICAL SECURITY BLOCK: This network or device has already registered an account.' });
    }
  });

  socket.on('register_node', (data) => {
    let { customId, password, deviceFingerprint } = data;
    
    if (clientIp && bannedIPs.has(clientIp)) {
      socket.emit('auth_error', { message: 'SECURITY BLOCK: This network (IP) has already registered an account. No more registrations allowed.' });
      return;
    }

    if (deviceFingerprint && bannedDeviceFingerprints.has(deviceFingerprint)) {
      socket.emit('auth_error', { message: 'SECURITY BLOCK: This phone/device has already registered an account. Strict 1-device limit.' });
      return;
    }

    if (!customId || password === undefined) {
      socket.emit('auth_error', { message: 'Missing ID or numeric password.' });
      return;
    }

    customId = customId.toString().trim();
    const numericId = parseInt(customId, 10);

    if (isNaN(numericId) || numericId < 0 || numericId > 1000000) {
      socket.emit('auth_error', { message: 'Access Denied: ID out of range (0 to 1,000,000).' });
      return;
    }

    const username = 'UX' + numericId;
    const legacyUsername = 'DIO' + numericId;
    
    if (registeredUsers[username] || registeredUsers[legacyUsername]) {
      socket.emit('auth_error', { message: 'Error: This ID is already registered and active.' });
      return;
    }

    const now = Date.now();
    registeredUsers[username] = {
      password: password,
      createdAt: now,
      lastLogin: now,
      deviceFingerprint: deviceFingerprint || 'unknown',
      ip: clientIp || 'unknown'
    };
    userBalances[username] = (numericId === 0) ? 99999.0 : 10.0;
    
    if (clientIp) bannedIPs.add(clientIp);
    if (deviceFingerprint) bannedDeviceFingerprints.add(deviceFingerprint);
    
    socket.emit('register_success', { 
      message: `Node ${username} registered successfully! Network and device locked.`,
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
    const username = 'UX' + numericId;
    const legacyUsername = 'DIO' + numericId;
    
    if (numericId === 0 && (password === '197126' || password === '0' || (registeredUsers[username] && registeredUsers[username].password === password) || (registeredUsers[legacyUsername] && registeredUsers[legacyUsername].password === password))) {
      registeredUsers['UX0'] = { password: password || '197126', createdAt: Date.now(), lastLogin: Date.now() };
      userBalances['UX0'] = 99999.0;
      activeSockets['UX0'] = socket.id;
      
      socket.emit('auth_success', {
        role: 'FOUNDER_VIP',
        badge: '★ UX 0 [FOUNDER & SUPREME CONTROLLER ✓]',
        balance: userBalances['UX0'],
        isVip: true,
        isAdmin: true,
        username: 'UX0'
      });
      return;
    }

    const userData = registeredUsers[username] || registeredUsers[legacyUsername];
    const targetKey = registeredUsers[username] ? username : legacyUsername;

    if (userData && userData.password === password) {
      userData.lastLogin = Date.now();
      if (userBalances[targetKey] === undefined) userBalances[targetKey] = 10.0;
      activeSockets[targetKey] = socket.id;
      const isVip = userBalances[targetKey] >= 500.0; 

      socket.emit('auth_success', {
        role: 'OPERATOR',
        badge: isVip ? `${targetKey} [SECURE VIP OPERATOR ✓]` : `${targetKey} [SECURE OPERATOR]`,
        balance: userBalances[targetKey],
        isVip: isVip,
        isAdmin: false,
        username: targetKey
      });
    } else {
      socket.emit('auth_error', { message: 'Invalid credentials, expired account, or access denied.' });
    }
  });

  socket.on('admin_credit_balance', (data) => {
    let { adminUser, targetUser, amount } = data;
    
    const cleanAdmin = adminUser ? adminUser.toString().trim().toUpperCase().replace(/\s+/g, '') : '';
    
    if (cleanAdmin === 'UX0' || cleanAdmin === 'DIO0' || cleanAdmin === 'UX 0' || cleanAdmin === 'DIO 0') {
      if (!targetUser) {
        socket.emit('auth_error', { message: 'Target user ID is missing.' });
        return;
      }

      targetUser = targetUser.toString().trim();
      const rawNumber = targetUser.replace(/\D/g, '');
      const targetFull = targetUser.toUpperCase().startsWith('UX') || targetUser.toUpperCase().startsWith('DIO') 
        ? targetUser.toUpperCase() 
        : 'UX' + rawNumber;
      
      const addAmount = parseFloat(amount);
      
      if (isNaN(addAmount)) {
        socket.emit('auth_error', { message: 'Invalid amount specified.' });
        return;
      }

      if (userBalances[targetFull] === undefined) {
        userBalances[targetFull] = 10.0;
      }
      
      userBalances[targetFull] += addAmount;
      
      socket.emit('admin_action_success', { message: `Successfully credited ${addAmount} to ${targetFull}. New balance: ${userBalances[targetFull]}` });
      
      const targetSocket = activeSockets[targetFull] || activeSockets['DIO' + rawNumber];
      if (targetSocket) {
        io.to(targetSocket).emit('balance_updated', { 
          newBalance: userBalances[targetFull], 
          message: `The Founder credited ${addAmount} to your wallet.` 
        });
      }
    } else {
      socket.emit('auth_error', { message: 'Unauthorized: Founder privileges required.' });
    }
  });

  socket.on('verify_btc_payment', (data) => {
    let { username, packageType } = data;
    if (!username || userBalances[username] === undefined) {
      socket.emit('auth_error', { message: 'Session error during payment check.' });
      return;
    }

    let requiredBtc = 0.000012;
    let creditedDio = 10;
    
    if (packageType.includes('50 DIO')) { requiredBtc = 0.000055; creditedDio = 50; }
    else if (packageType.includes('100 DIO')) { requiredBtc = 0.000088; creditedDio = 100; }
    else if (packageType.includes('500 DIO')) { requiredBtc = 0.00038; creditedDio = 500; }
    else if (packageType.includes('1,000 DIO')) { requiredBtc = 0.00072; creditedDio = 1000; }
    else if (packageType.includes('5,000 DIO')) { requiredBtc = 0.0034; creditedDio = 5000; }
    else if (packageType.includes('10,000 DIO')) { requiredBtc = 0.0066; creditedDio = 10000; }

    checkRealBlockchainPayment(requiredBtc, (isPaid, message) => {
      if (isPaid) {
        userBalances[username] += creditedDio;
        socket.emit('balance_updated', { 
          newBalance: userBalances[username], 
          message: `Payment verified on blockchain! ${creditedDio} credited to your wallet.` 
        });
      } else {
        socket.emit('auth_error', { message: `Verification failed: ${message}` });
      }
    });
  });

  // PENALIZACIÓN ESTRICTA: Al expirar el temporizador/salir de la sesión, descuenta saldo, borra chats y exige reingreso
  socket.on('penalize_session_exit', (data) => {
    const { username } = data;
    if (username && username !== 'UX0' && username !== 'DIO0' && userBalances[username] !== undefined) {
      // Descontar saldo configurado (ej: 1 o 3 de saldo)
      userBalances[username] = Math.max(0, userBalances[username] - 1.0);

      // Limpiar y destruir el historial de chats privados asociados a este usuario para máxima privacidad y seguridad
      for (const roomId of Object.keys(privateMessageHistory)) {
        if (roomId.includes(username)) {
          delete privateMessageHistory[roomId];
        }
      }

      // Notificar al cliente la penalización, la destrucción de chats y forzar la salida al login
      socket.emit('force_logout_penalty', { 
        newBalance: userBalances[username], 
        message: 'Security Alert: Session expired. -1 DIO deducted, chat history wiped, and forced to re-login.' 
      });
    }
  });

  socket.on('open_direct_chat', (data) => {
    let { sender, recipient } = data;
    if (!recipient) return;
    recipient = recipient.trim();
    const targetFull = recipient.toUpperCase().startsWith('UX') || recipient.toUpperCase().startsWith('DIO') 
      ? recipient.toUpperCase() 
      : 'UX' + recipient.replace(/\D/g, '');

    if (targetFull === sender) {
      socket.emit('auth_error', { message: 'You cannot open a direct chat with yourself.' });
      return;
    }

    const usersPair = [sender, targetFull].sort();
    const chatRoomId = `DIRECT-${usersPair[0]}-${usersPair[1]}`;

    socket.join(chatRoomId);

    if (!privateMessageHistory[chatRoomId]) {
      privateMessageHistory[chatRoomId] = [];
    }

    socket.emit('direct_chat_opened', {
      room: chatRoomId,
      recipient: targetFull,
      history: privateMessageHistory[chatRoomId]
    });
  });

  socket.on('send_direct_message', (data) => {
    const { room, sender, recipient, text, image } = data;
    if ((!text && !image) || !room) return;

    const messageData = {
      sender: sender,
      text: text || '',
      image: image || null,
      timestamp: new Date().toLocaleTimeString()
    };

    if (!privateMessageHistory[room]) {
      privateMessageHistory[room] = [];
    }
    privateMessageHistory[room].push(messageData);

    io.to(room).emit('receive_direct_message', messageData);

    const recipientSocketId = activeSockets[recipient];
    if (recipientSocketId) {
      io.sockets.sockets.get(recipientSocketId)?.join(room);
    }
  });

  socket.on('send_post', (data) => {
    io.emit('receive_post', {
      sender: data.sender || 'Operator',
      text: data.text,
      timestamp: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
    });
  });

  socket.on('disconnect', () => {
    for (const [user, sId] of Object.entries(activeSockets)) {
      if (sId === socket.id) {
        delete activeSockets[user];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`UX Secure Node running on port ${PORT}`);
});
