// --- IMPORTIAMO IL TUO FILE ENGINES ---
// Questo garantisce che usiamo SOLO i provider definiti nel tuo file (Corsaro, Knaben, ecc.)
const { searchMagnet } = require('./engines'); 

const dbHelper = require('./db-helper');
const { MovieDb } = require('moviedb-promise');
const PQueue = require('p-queue').default;

// Configurazione TMDB
const moviedb = new MovieDb(process.env.TMDB_KEY);

// Coda per non bloccare il tuo PC (1 ricerca alla volta)
const queue = new PQueue({ concurrency: 1 });

/**
 * Estrae l'hash pulito dal magnet link.
 * Necessario perché il DB usa l'hash come chiave primaria.
 */
function extractInfoHash(magnet) {
    if (!magnet) return null;
    const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]{40})/i);
    return match ? match[1].toLowerCase() : null;
}

/**
 * Processa una singola serie TV
 */
async function processSeries(tvShow) {
    console.log(`\n📺 [CRAWLER] Elaborazione: ${tvShow.name} (${tvShow.id})`);
    
    // 1. Recuperiamo l'IMDB ID (Serve al tuo engines.js e al DB)
    let imdbId = null;
    try {
        const externalIds = await moviedb.tvExternalIds({ id: tvShow.id });
        imdbId = externalIds.imdb_id;
    } catch (e) {
        console.log(`   ⚠️ Nessun ID IMDB trovato per ${tvShow.name}, salto.`);
        return;
    }

    if (!imdbId) return;

    // 2. CHIAMIAMO IL TUO ENGINES.JS
    // Passiamo i parametri esatti che il tuo file si aspetta:
    // searchMagnet(title, year, type, imdbId)
    // Il tuo file si occuperà di cercare su Corsaro, Knaben, Uindex, ecc.
    const year = tvShow.first_air_date ? tvShow.first_air_date.substring(0, 4) : '';
    
    console.log(`   🔎 Avvio ricerca tramite il tuo engines.js...`);
    
    // Qui avviene la magia: usa SOLO la tua logica
    const results = await searchMagnet(tvShow.name, year, 'tv', imdbId);

    if (!results || results.length === 0) {
        console.log(`   ❌ Nessun risultato trovato dai tuoi provider.`);
        return;
    }

    // 3. Prepariamo i dati per il Database
    // Mappiamo i risultati del tuo engine nel formato del DB PostgreSQL
    const batchToSave = results.map(res => {
        const hash = extractInfoHash(res.magnet);
        if (!hash) return null;

        return {
            info_hash: hash,
            provider: res.source,      // Es. "Corsaro", "Knaben" (come definito nel tuo file)
            title: res.title,
            size: res.sizeBytes || 0,  // Il tuo engines.js calcola già i bytes
            type: 'series',            // Stiamo cercando serie TV
            seeders: res.seeders || 0,
            imdb_id: imdbId,
            tmdb_id: tvShow.id
        };
    }).filter(item => item !== null); // Rimuoviamo eventuali errori

    // 4. Salviamo nel DB
    if (batchToSave.length > 0) {
        await dbHelper.batchInsertTorrents(batchToSave);
        console.log(`   💾 Salvati ${batchToSave.length} torrent nel Database.`);
    }
}

/**
 * Loop Infinito che scansiona le serie popolari
 */
async function startLoop() {
    console.log("🚀 Crawler avviato. Userò ESCLUSIVAMENTE i provider del tuo engines.js");
    
    let page = 1;
    const maxPage = 20; // Scansiona le prime 20 pagine di serie popolari, poi ricomincia

    while (true) {
        try {
            console.log(`\n--- SCANSIONE PAGINA TMDB ${page} ---`);
            
            const popular = await moviedb.tvPopular({ language: 'it-IT', page });
            
            if (popular.results) {
                for (const show of popular.results) {
                    // Aggiungi alla coda di lavoro
                    queue.add(() => processSeries(show));
                }
            }
            
            // Aspettiamo che finisca di elaborare tutta la pagina corrente
            await queue.onIdle();
            
            page++;
            if (page > maxPage) {
                page = 1;
                console.log("--- Ciclo completato. Pausa di 5 minuti prima di ricominciare ---");
                await new Promise(resolve => setTimeout(resolve, 300000));
            }

        } catch (error) {
            console.error("Errore generico nel loop:", error.message);
            // In caso di errore API, aspettiamo 10 secondi e riproviamo
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

module.exports = { startLoop };
