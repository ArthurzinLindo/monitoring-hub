const { getDatabase, saveDatabase } = require("./connection");

async function runMigrations() {
  const db = await getDatabase();

  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL,
      identifier_digits TEXT NOT NULL,
      api_key TEXT NOT NULL,
      system TEXT NOT NULL CHECK (system IN ('DIMEP', 'MADIS')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (system, identifier_digits, api_key)
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_companies_system_identifier
    ON companies (system, identifier_digits);
  `);

  saveDatabase();
}

module.exports = {
  runMigrations,
};
