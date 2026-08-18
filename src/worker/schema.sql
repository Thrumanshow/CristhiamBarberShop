CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  cliente TEXT NOT NULL CHECK (length(cliente) BETWEEN 2 AND 100),
  servicio TEXT NOT NULL CHECK (servicio IN ('corte-tradicional', 'diseno-barba', 'combo-corte-barba')),
  precio REAL NOT NULL CHECK (precio >= 0),
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'confirmed' CHECK (estado IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (fecha)
);

CREATE INDEX IF NOT EXISTS idx_reservas_fecha ON reservas (fecha);
CREATE INDEX IF NOT EXISTS idx_reservas_estado_fecha ON reservas (estado, fecha);
