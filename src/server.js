const express = require('express');
const path = require('path');
const dbHelper = require('./db-helper');
const crawler = require('./crawler');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Inizializza DB
dbHelper.initDatabase();

// API per la GUI
app.get('/api/data', async (req, res) => {
    try {
        const torrents = await dbHelper.getLatestTorrents(200);
        const stats = await dbHelper.getStats();
        res.json({ torrents, stats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(3000, () => {
    console.log('🌐 Server GUI attivo su http://localhost:3000');
    // Avvia il crawler dopo 5 secondi
    setTimeout(() => crawler.startLoop(), 5000);
});
