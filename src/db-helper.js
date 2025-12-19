const { Pool } = require('pg');

let pool;

function initDatabase(config) {
    if (pool) return;
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000
    });
    console.log("🔌 Database connesso.");
}

// Inserimento ottimizzato con UPSERT come da tua documentazione
async function batchInsertTorrents(torrents) {
    if (!torrents.length) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const query = `
            INSERT INTO torrents (info_hash, provider, title, size, type, seeders, imdb_id, tmdb_id, upload_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (info_hash) DO UPDATE SET
                seeders = GREATEST(EXCLUDED.seeders, torrents.seeders),
                imdb_id = COALESCE(torrents.imdb_id, EXCLUDED.imdb_id),
                tmdb_id = COALESCE(torrents.tmdb_id, EXCLUDED.tmdb_id),
                size = CASE WHEN torrents.size = 0 OR torrents.size IS NULL THEN EXCLUDED.size ELSE torrents.size END
        `;
        
        for (const t of torrents) {
            // Assicuriamoci che i dati siano validi
            if(!t.info_hash) continue;
            await client.query(query, [
                t.info_hash, t.provider, t.title, t.size || 0, 
                t.type, t.seeders || 0, t.imdb_id, t.tmdb_id
            ]);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Errore Batch Insert:", e);
    } finally {
        client.release();
    }
}

async function getLatestTorrents(limit = 100) {
    const res = await pool.query(`
        SELECT * FROM torrents 
        WHERE type = 'series' 
        ORDER BY upload_date DESC, seeders DESC 
        LIMIT $1`, [limit]);
    return res.rows;
}

async function getStats() {
    const res = await pool.query(`
        SELECT 
            (SELECT count(*) FROM torrents) as total_torrents,
            (SELECT count(*) FROM torrents WHERE type='series') as series_count,
            (SELECT sum(seeders) FROM torrents) as total_seeders
    `);
    return res.rows[0];
}

module.exports = { initDatabase, batchInsertTorrents, getLatestTorrents, getStats };
