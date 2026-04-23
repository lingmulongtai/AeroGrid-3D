-- TimescaleDB schema for AeroGrid-3D
-- Automatically executed when the container first starts.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Flight history ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_snapshots (
  time          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  icao24        TEXT         NOT NULL,
  callsign      TEXT,
  country       TEXT,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  altitude      DOUBLE PRECISION,
  velocity      DOUBLE PRECISION,
  heading       DOUBLE PRECISION,
  vertical_rate DOUBLE PRECISION,
  on_ground     BOOLEAN      NOT NULL DEFAULT FALSE,
  category      TEXT
);

-- Convert to hypertable (automatic time-based partitioning)
SELECT create_hypertable('flight_snapshots', 'time', if_not_exists => TRUE);

-- Compress chunks older than 1 day (typically 80-95% storage savings)
ALTER TABLE flight_snapshots SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'icao24'
);
SELECT add_compression_policy('flight_snapshots', INTERVAL '1 day');

-- Auto-drop data older than 30 days
SELECT add_retention_policy('flight_snapshots', INTERVAL '30 days');

CREATE INDEX IF NOT EXISTS idx_fs_icao24 ON flight_snapshots (icao24, time DESC);

-- ── Weather snapshots ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_snapshots (
  time          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  radar_tile_url TEXT        NOT NULL
);
SELECT create_hypertable('weather_snapshots', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('weather_snapshots', INTERVAL '7 days');
