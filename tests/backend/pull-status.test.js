const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const XLSX = require("xlsx");

const {
  dimepSuccessPayload,
  emptyPayload,
  madisSuccessPayload,
  partiallyInvalidPayload,
} = require("../fixtures/pullStatusPayloads");
const { PULL_STATUS_PERF_LOG_FILENAME } = require("../../src/utils/performanceLog");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-hub-pull-status-"));
process.env.PAINEL_MONITORIA_DATA_DIR = tempDataDir;

const axiosModulePath = require.resolve("axios");
const originalAxiosCacheEntry = require.cache[axiosModulePath];
const axiosCalls = [];
let axiosHandler = async () => {
  throw new Error("Axios falso sem resposta configurada.");
};

const fakeAxios = {
  post(url, payload, options) {
    axiosCalls.push({
      url,
      identifier: options?.headers?.identifier,
    });
    return axiosHandler(url, payload, options);
  },
};

require.cache[axiosModulePath] = {
  id: axiosModulePath,
  filename: axiosModulePath,
  loaded: true,
  exports: fakeAxios,
};

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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (originalAxiosCacheEntry) {
    require.cache[axiosModulePath] = originalAxiosCacheEntry;
  } else {
    delete require.cache[axiosModulePath];
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

async function importCompanies(rows) {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([createWorkbookBuffer(rows)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "empresas-pull-status-sinteticas.xlsx",
  );

  const imported = await requestJson("/api/import-companies", {
    method: "POST",
    body: formData,
  });
  assert.equal(imported.response.status, 200);
  return imported;
}

function setAxiosHandler(handler) {
  axiosCalls.length = 0;
  axiosHandler = handler;
}

function pullStatus(forceRefresh = false) {
  return requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force_refresh: forceRefresh }),
  });
}

function assertPublicResponseIsSafe(text, secrets = []) {
  assert.equal(/api[_-]?key/i.test(text), false);
  assert.equal(/\bBearer\b/i.test(text), false);
  assert.equal(/\bauthorization\b/i.test(text), false);
  assert.equal(/\bheaders?\b/i.test(text), false);
  assert.equal(/\b(raw_)?payload\b/i.test(text), false);
  secrets.forEach((secret) => assert.equal(text.includes(secret), false));
}

async function waitForLogEvent(logPath, event, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath) && fs.readFileSync(logPath, "utf8").includes(`"event":"${event}"`)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Evento de log nao observado: ${event}`);
}

function syntheticCompanies() {
  return [
    {
      "Nome da empresa": "Empresa DIMEP Sintetica",
      CNPJ: "61.000.000/0001-06",
      "API Key": "synthetic-dimep-pull-key",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa MADIS Sintetica",
      CNPJ: "62.000.000/0001-07",
      "API Key": "synthetic-madis-pull-key",
      Sistema: "MADIS",
    },
  ];
}

test("POST /api/pull-status caracteriza sucesso misto DIMEP e MADIS", async () => {
  const companies = syntheticCompanies();
  await importCompanies(companies);
  setAxiosHandler(async (url) => ({
    status: 200,
    data: url.includes("dimepkairos") ? dimepSuccessPayload : madisSuccessPayload,
  }));

  const result = await pullStatus();

  assert.equal(result.response.status, 200);
  assert.equal(result.body.total, 2);
  assert.equal(result.body.grouped.DIMEP.length, 1);
  assert.equal(result.body.grouped.MADIS.length, 1);
  assert.equal(result.body.summary.healthy_companies, 2);
  assert.equal(axiosCalls.length, 2);
  assertPublicResponseIsSafe(result.text, companies.map((company) => company["API Key"]));
});

test("POST /api/pull-status reutiliza cache dentro do TTL", async () => {
  await importCompanies([syntheticCompanies()[0]]);
  setAxiosHandler(async () => ({ status: 200, data: dimepSuccessPayload }));

  const first = await pullStatus();
  const second = await pullStatus();

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(axiosCalls.length, 1);
  assert.equal(first.body.summary.from_cache, 0);
  assert.equal(second.body.summary.from_cache, 1);
  assert.equal(second.body.companies[0].from_cache, true);
});

test("POST /api/pull-status force_refresh ignora cache preenchido", async () => {
  await importCompanies([syntheticCompanies()[0]]);
  setAxiosHandler(async () => ({ status: 200, data: dimepSuccessPayload }));

  await pullStatus();
  const refreshed = await pullStatus(true);

  assert.equal(refreshed.response.status, 200);
  assert.equal(axiosCalls.length, 2);
  assert.equal(refreshed.body.summary.from_cache, 0);
  assert.equal(refreshed.body.companies[0].from_cache, false);
  assertPublicResponseIsSafe(refreshed.text, ["synthetic-dimep-pull-key"]);
});

test("POST /api/pull-status repete identificador apos HTTP 403", async () => {
  await importCompanies([syntheticCompanies()[0]]);
  setAxiosHandler(async () => {
    if (axiosCalls.length === 1) {
      return { status: 403, data: { message: "Identificador sintetico rejeitado." } };
    }
    return { status: 200, data: dimepSuccessPayload };
  });

  const result = await pullStatus();

  assert.equal(result.response.status, 200);
  assert.equal(result.body.summary.healthy_companies, 1);
  assert.equal(axiosCalls.length, 2);
  assert.notEqual(axiosCalls[0].identifier, axiosCalls[1].identifier);
  assertPublicResponseIsSafe(result.text, ["synthetic-dimep-pull-key"]);
});

test("POST /api/pull-status converte erro HTTP em resposta publica segura", async () => {
  const syntheticSecret = "synthetic-http-error-key";
  await importCompanies([{
    "Nome da empresa": "Empresa HTTP Sintetica",
    CNPJ: "63.000.000/0001-08",
    "API Key": syntheticSecret,
    Sistema: "DIMEP",
  }]);
  setAxiosHandler(async () => ({
    status: 500,
    data: { message: `Falha remota com credencial ${syntheticSecret}` },
  }));

  const result = await pullStatus();

  assert.equal(result.response.status, 200);
  assert.equal(result.body.summary.unhealthy_companies, 1);
  assert.equal(result.body.companies[0].status, "error");
  assert.match(result.body.companies[0].error, /Falha HTTP na API \(500\)/);
  assertPublicResponseIsSafe(result.text, [syntheticSecret]);

  const logText = fs.readFileSync(path.join(tempDataDir, PULL_STATUS_PERF_LOG_FILENAME), "utf8");
  assert.equal(logText.includes(syntheticSecret), false);
});

test("POST /api/pull-status converte timeout em resposta publica controlada", async () => {
  await importCompanies([syntheticCompanies()[1]]);
  setAxiosHandler(async () => {
    const error = new Error("Timeout sintetico controlado.");
    error.code = "ECONNABORTED";
    throw error;
  });

  const result = await pullStatus();

  assert.equal(result.response.status, 200);
  assert.equal(result.body.summary.unhealthy_companies, 1);
  assert.equal(result.body.companies[0].error, "Tempo limite ao conectar com a API da empresa.");
  assertPublicResponseIsSafe(result.text, ["synthetic-madis-pull-key"]);
});

test("POST /api/pull-status caracteriza payload vazio e parcialmente invalido", async () => {
  await importCompanies(syntheticCompanies());
  setAxiosHandler(async (url) => ({
    status: 200,
    data: url.includes("dimepkairos") ? emptyPayload : partiallyInvalidPayload,
  }));

  const result = await pullStatus();
  const dimep = result.body.grouped.DIMEP[0];
  const madis = result.body.grouped.MADIS[0];

  assert.equal(result.response.status, 200);
  assert.equal(dimep.status, "error");
  assert.equal(dimep.active_clock_count, 0);
  assert.equal(dimep.error, "Nenhum relogio ativo encontrado.");
  assert.equal(madis.status, "error");
  assert.equal(madis.active_clock_count, 1);
  assert.equal(madis.clocks[0].code, "303");
  assert.equal(madis.clocks[0].is_communicating, false);
  assertPublicResponseIsSafe(result.text, syntheticCompanies().map((company) => company["API Key"]));
});

test("POST /api/pull-status compartilha execucao concorrente em andamento", async () => {
  await importCompanies(syntheticCompanies());
  const logPath = path.join(tempDataDir, PULL_STATUS_PERF_LOG_FILENAME);
  fs.rmSync(logPath, { force: true });

  let releaseRequests;
  const requestsReleased = new Promise((resolve) => {
    releaseRequests = resolve;
  });
  let startedRequests = 0;
  let allRequestsStarted;
  const allStarted = new Promise((resolve) => {
    allRequestsStarted = resolve;
  });

  setAxiosHandler(async (url) => {
    startedRequests += 1;
    if (startedRequests === 2) {
      allRequestsStarted();
    }
    await requestsReleased;
    return {
      status: 200,
      data: url.includes("dimepkairos") ? dimepSuccessPayload : madisSuccessPayload,
    };
  });

  const firstRequest = pullStatus();
  await allStarted;
  const secondRequest = pullStatus();
  await waitForLogEvent(logPath, "join_running_pull_status");
  releaseRequests();

  const [first, second] = await Promise.all([firstRequest, secondRequest]);

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(axiosCalls.length, 2);
  assert.deepEqual(second.body, first.body);
});
