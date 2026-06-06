const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const XLSX = require("xlsx");

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

function createWorkbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Empresas");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
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

test("POST /api/pull-status auto_refresh_sync sem payload retorna conflito sem API externa", async () => {
  delete require.cache[axiosModulePath];

  const { response, text, body } = await requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "auto_refresh_sync" }),
  });

  assert.equal(response.status, 409);
  assert.equal(body.detail, "Nenhum status automatico disponivel para sincronizacao.");
  assert.equal(require.cache[axiosModulePath], undefined);
  assert.equal(text.includes("api_key"), false);
});

test("POST /api/pull-status com JSON invalido retorna contrato controlado", async () => {
  const { response, text, body } = await requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"force_refresh":',
  });

  assert.equal(response.status, 400);
  assert.equal(body.detail, "JSON invalido na requisicao.");
  assert.equal(text.includes("api_key"), false);
});

test("POST /api/import-companies e GET /api/companies nao expoem credenciais", async () => {
  const secrets = ["synthetic-dimep-key-123", "synthetic-madis-key-456"];
  const workbookBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa Sintetica DIMEP",
      CNPJ: "10.000.000/0001-01",
      "API Key": secrets[0],
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa Sintetica MADIS",
      CNPJ: "20.000.000/0001-02",
      "API Key": secrets[1],
      Sistema: "MADIS",
    },
  ]);
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([workbookBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "empresas-sinteticas.xlsx",
  );

  const imported = await requestJson("/api/import-companies", {
    method: "POST",
    body: formData,
  });

  assert.equal(imported.response.status, 200);
  assert.equal(imported.body.total, 2);
  assert.equal(imported.body.grouped.DIMEP.length, 1);
  assert.equal(imported.body.grouped.MADIS.length, 1);
  assert.equal(imported.text.includes("api_key"), false);
  secrets.forEach((secret) => assert.equal(imported.text.includes(secret), false));

  const listed = await requestJson("/api/companies");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.total, 2);
  assert.equal(listed.body.companies.length, 2);
  assert.equal(listed.text.includes("api_key"), false);
  secrets.forEach((secret) => assert.equal(listed.text.includes(secret), false));
  assert.equal(require.cache[axiosModulePath], undefined);
});
