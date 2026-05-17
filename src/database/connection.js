const fs = require("fs");
const path = require("path");

const initSqlJs = require("sql.js");

const APP_DATA_DIR = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), "AppData", "Roaming");
const DATA_DIR = process.env.PAINEL_MONITORIA_DATA_DIR || path.join(APP_DATA_DIR, "Monitoring Hub");
const DB_PATH = path.join(DATA_DIR, "painel-monitoria.sqlite");

let SQL = null;
let database = null;
let databaseInitPromise = null;

function startupLog(event, details = {}) {
  const logPath = process.env.PAINEL_STARTUP_LOG_PATH;
  if (!logPath) {
    return;
  }

  try {
    fs.appendFileSync(
      logPath,
      `[startup] ${JSON.stringify({ scope: "database", event, ...details })}\n`,
      "utf8",
    );
  } catch {
    // Diagnostico de startup nao deve interferir no banco.
  }
}

async function initializeDatabase() {
  if (databaseInitPromise) {
    return databaseInitPromise;
  }

  databaseInitPromise = (async () => {
    const totalStartedAt = Date.now();
    const mkdirStartedAt = Date.now();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    startupLog("data_dir_ready", { duration_ms: Date.now() - mkdirStartedAt });

    const sqlStartedAt = Date.now();
    SQL = await initSqlJs();
    startupLog("sqljs_initialized", { duration_ms: Date.now() - sqlStartedAt });

    if (fs.existsSync(DB_PATH)) {
      const loadStartedAt = Date.now();
      database = new SQL.Database(fs.readFileSync(DB_PATH));
      startupLog("sqlite_file_loaded", { duration_ms: Date.now() - loadStartedAt });
      startupLog("database_initialized", { duration_ms: Date.now() - totalStartedAt });
      return database;
    }

    const createStartedAt = Date.now();
    database = new SQL.Database();
    saveDatabase();
    startupLog("sqlite_file_created", { duration_ms: Date.now() - createStartedAt });
    startupLog("database_initialized", { duration_ms: Date.now() - totalStartedAt });
    return database;
  })();

  return databaseInitPromise;
}

async function getDatabase() {
  if (!database) {
    await initializeDatabase();
  }
  return database;
}

function saveDatabase() {
  if (!database) {
    throw new Error("Banco de dados ainda nao inicializado.");
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(database.export()));
}

async function runInTransaction(callback) {
  const db = await getDatabase();
  db.run("BEGIN IMMEDIATE TRANSACTION");

  try {
    const result = callback(db);
    db.run("COMMIT");
    saveDatabase();
    return result;
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

module.exports = {
  DB_PATH,
  initializeDatabase,
  getDatabase,
  runInTransaction,
  saveDatabase,
};
