-- ==========================================
-- 1. TABELLA PRINCIPALE: TORRENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS torrents (
    info_hash TEXT PRIMARY KEY,
    provider TEXT,
    title TEXT NOT NULL,
    size BIGINT,
    type TEXT CHECK (type IN ('movie', 'series')),
    upload_date TIMESTAMP DEFAULT NOW(),
    seeders INTEGER DEFAULT 0,
    imdb_id TEXT,
    tmdb_id INTEGER,
    all_imdb_ids JSONB DEFAULT '[]',
    cached_rd BOOLEAN,
    last_cached_check TIMESTAMP,
    file_index INTEGER,
    file_title TEXT,
    title_vector TSVECTOR
);

-- Indici per velocizzare le ricerche (IMDB, TMDB, Seeders)
CREATE INDEX IF NOT EXISTS idx_torrents_imdb_id ON torrents(imdb_id);
CREATE INDEX IF NOT EXISTS idx_torrents_tmdb_id ON torrents(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_torrents_seeders ON torrents(seeders DESC);
CREATE INDEX IF NOT EXISTS idx_torrents_cached_rd ON torrents(cached_rd);

-- Indice specifico per cercare dentro i JSON (utile per i Pack che contengono più film/serie)
CREATE INDEX IF NOT EXISTS idx_torrents_all_imdb_ids ON torrents USING GIN(all_imdb_ids);

-- Indice per la Full-Text Search (ricerca per titolo)
CREATE INDEX IF NOT EXISTS idx_torrents_title_vector ON torrents USING GIN(title_vector);


-- ==========================================
-- 2. LOGICA FULL-TEXT SEARCH (AUTOMATICA)
-- ==========================================
-- Funzione che aggiorna automaticamente il vettore di ricerca quando inserisci un titolo
CREATE OR REPLACE FUNCTION update_title_vector() RETURNS TRIGGER AS $$
BEGIN
    -- 'italian' config per gestire accenti e stop-words italiane
    NEW.title_vector := to_tsvector('italian', COALESCE(NEW.title, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger che esegue la funzione sopra ad ogni INSERT o UPDATE
DROP TRIGGER IF EXISTS torrents_title_vector_update ON torrents;
CREATE TRIGGER torrents_title_vector_update
    BEFORE INSERT OR UPDATE ON torrents
    FOR EACH ROW EXECUTE FUNCTION update_title_vector();


-- ==========================================
-- 3. TABELLA: FILES (Per episodi singoli)
-- ==========================================
CREATE TABLE IF NOT EXISTS files (
    info_hash TEXT REFERENCES torrents(info_hash) ON DELETE CASCADE,
    file_index INTEGER NOT NULL,
    title TEXT,
    size BIGINT,
    imdb_id TEXT,
    imdb_season INTEGER,
    imdb_episode INTEGER,
    PRIMARY KEY (info_hash, file_index)
);

-- Indice per trovare velocemente un episodio specifico (es. S01E05)
CREATE INDEX IF NOT EXISTS idx_files_episode ON files(imdb_id, imdb_season, imdb_episode);


-- ==========================================
-- 4. TABELLA: PACK_FILES (Per mappare i pack)
-- ==========================================
CREATE TABLE IF NOT EXISTS pack_files (
    pack_hash TEXT REFERENCES torrents(info_hash) ON DELETE CASCADE,
    imdb_id TEXT NOT NULL,
    file_index INTEGER,
    file_path TEXT,
    file_size BIGINT,
    PRIMARY KEY (pack_hash, imdb_id)
);

-- Indice per cercare se un film/serie è contenuto in un pack
CREATE INDEX IF NOT EXISTS idx_pack_files_imdb ON pack_files(imdb_id);
