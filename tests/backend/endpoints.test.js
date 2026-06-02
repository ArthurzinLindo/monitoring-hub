const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const { PULL_STATUS_PERF_LOG_FILENAME } = require("../../src/utils/performanceLog");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-hub-backend-"));
process.env.PAINEL_MONITORIA_DATA_DIR = tempDataDir;
const axiosModulePath = require.resolve("axios");

const {
  app,
  initializeAppData,
} = require("../../server");

let server;
let baseUrl;

before(async () => {
  await initializeAppData();
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  fs.rmSync(tempDataDir, { recursive: true, force: true });
});

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return {
    response,
    text,
    body: text ? JSON.parse(text) : null,
  };
}

test("GET /api/health retorna contrato publico sem segredo", async () => {
  const { response, text, body } = await requestJson("/api/health");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(body.status, "ok");
  assert.equal(typeof body.environment_status, "string");
  assert.equal(typeof body.environment_active, "boolean");
  assert.equal(typeof body.auto_refresh_enabled, "boolean");
  assert.equal(text.includes("api_key"), false);
});

test("GET /api/companies retorna lista publica vazia sem api_key", async () => {
  const { response, text, body } = await requestJson("/api/companies");

  assert.equal(response.status, 200);
  assert.equal(body.total, 0);
  assert.deepEqual(body.companies, []);
  assert.deepEqual(body.grouped, { DIMEP: [], MADIS: [] });
  assert.equal(text.includes("api_key"), false);
});

test("POST /api/pull-status sem empresas retorna erro controlado sem API externa", async () => {
  const { response, text, body } = await requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force_refresh: false }),
  });

  assert.equal(response.status, 400);
  assert.equal(body.detail, "Importe um arquivo Excel antes de puxar status.");
  assert.equal(text.includes("api_key"), false);
});

test("POST /api/pull-status sem empresas registra log seguro sem carregar Axios", async () => {
  const logPath = path.join(tempDataDir, PULL_STATUS_PERF_LOG_FILENAME);
  fs.rmSync(logPath, { force: true });
  delete require.cache[axiosModulePath];

  const { response, text } = await requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force_refresh: true }),
  });

  assert.equal(response.status, 400);
  assert.equal(require.cache[axiosModulePath], undefined);
  assert.equal(text.includes("api_key"), false);

  const logText = fs.readFileSync(logPath, "utf8");
  assert.match(logText, /"event":"empty_companies"/);
  assert.match(logText, /"request_preparation_ms":\d+/);
  assert.equal(/api[_-]?key/i.test(logText), false);
  assert.equal(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(logText), false);
  assert.equal(/(?<!\d)\d{14}(?!\d)/.test(logText), false);
});
