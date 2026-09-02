/**
 * =====================================================================
 * 🛡️ DIO3.COM — EXTREME PRIVACY AND MAXIMUM SECURITY NETWORK CORE
 * =====================================================================
 * Integrated Technical Manual, Terms & Conditions, and Server Logic.
 * - Supreme Administrator: DIO_0 (Master Password: 197126 | VIP X Neon Gold with Checkmark Badge)
 * - Moderators: DIO_00 onwards (Monitoring only, direct reporting to the Chief)
 * - VIP X / Extreme: Ordered or repeated sequences of 1 to 9 digits (Professional Blinking Neon Red)
 * - Security: 100% numeric passwords, anti-emulator, military app-switch auto-close,
 * 3-report system with permanent hardware ban, and anti-fraud crypto payment gateway.
 * =====================================================================
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simulated in-memory database for the secure core
const usuariosDB = [];
const publicacionesDB = [];

// 1. Supreme Administrator Configuration DIO_0 (Absolute Chief)
const adminDio0 = {
    usuario: "DIO_0",
    passwordHash: "197126", // Strict numeric master password
    rango: "VIP X EXTREME",
    insignia: "Neon Gold with Checkmark Badge",
    esAdmin: true,
    reportes: 0,
    dispositivoBloqueado: false
};
usuariosDB.push(adminDio0);

// 2. Live Network Status and Anti-Emulator Panel
app.get('/', (req, res) => {
    res.status(200).json({
        platform: "dio3.com",
        status: "Active - Extreme Privacy Network",
        security: "Anti-Hacking, Anti-Emulator, and Military Shield Active",
        mainHierarchy: "DIO_0 (VIP X EXTREME - Neon Gold with Checkmark Badge)",
        legalRules: "Zero real names, zero tolerance for fraud, permanent device ban after 3 reports.",
        footer: "DiO 3 — VIP X EXTREME [SECURE NETWORK]"
    });
});

// 3. First-Time Registration with Strict Numeric Validation
app.post('/api/registrar', (req, res) => {
    const { password } = req.body;

    // Security rule: Password must be exclusively numeric
    if (!password || !/^\d+$/.test(password)) {
        return res.status(400).json({ 
            error: "dio3.com strict security: Password must be exclusively numeric using the on-screen keypad." 
        });
    }

    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const newUser = `DIO_${randomNum}`;

    const newUserData = {
        usuario: newUser,
        passwordHash: password,
        rango: "Standard",
        insignia: "Base Neon",
        reportes: 0,
        dispositivoBloqueado: false,
        fechaCreacion: new Date().toISOString()
    };

    usuariosDB.push(newUserData);

    res.status(201).json({
        message: "Welcome to dio3.com!",
        assignedUser: newUser,
        rank: newUserData.rango,
        importantWarning: "Save your username and password in your phone's notepad. The system does not store emails or allow recovery."
    });
});

// 4. Publishing System (With optional timer, anonymity, and checkmark reaction ✓)
app.post('/api/publicar', (req, res) => {
    const { usuario, password, contenido, tipoTemporizador, privado } = req.body;

    const userRecord = usuariosDB.find(u => u.usuario === usuario && u.passwordHash === password);
    if (!
