import sqlite3
import os

DB_PATH = os.path.expanduser('~/CristhiamBarberShop/data/barberia.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reservas (
            id TEXT PRIMARY KEY,
            cliente TEXT NOT NULL,
            servicio TEXT NOT NULL,
            fecha TEXT NOT NULL,
            sincronizado_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print(f"Base de datos SQLite inicializada en: {DB_PATH}")

if __name__ == '__main__':
    init_db()
