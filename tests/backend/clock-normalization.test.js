const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const XLSX = require("xlsx");

const {
  ambiguousListPayload,
  codeIpDedupPayload,
  codeNameDedupPayload,
  completeClockPayload,
  dateInferencePayload,
  deepFabricationPayload,
  fabricationDedupPayload,
  ipOnlyFabricationFallbackPayload,
  missingValuesPayload,
  mixedArrayPayload,
  orderAndCountersPayload,
  preferencePayload,
  stableFutureCollection,
  wrapperPayloads,
} = require("../fixtures/clockNormalizationPayloads");

const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-hub-clock-normalization-"));
process.env.PAINEL_MONITORIA_DATA_DIR = tempDataDir;

// Substitui Axios antes de carregar o servidor para impedir qualquer acesso real a rede.
const axiosModulePath = require.resolve("axios");
const originalAxiosCacheEntry = require.cache[axiosModulePath];
const axiosCalls = [];
let axiosPayload = null;

const fakeAxios = {
  async post(url) {
    axiosCalls.push({ url });
    return {
      status: 200,
      data: axiosPayload,
    };
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
  await importSyntheticCompany();
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

async function importSyntheticCompany() {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([createWorkbookBuffer([{
      "Nome da empresa": "Empresa Normalizacao Sintetica",
      CNPJ: "70.000.000/0001-00",
      "API Key": "synthetic-clock-normalization-key",
      Sistema: "DIMEP",
    }])], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "empresa-normalizacao-sintetica.xlsx",
  );

  const imported = await requestJson("/api/import-companies", {
    method: "POST",
    body: formData,
  });
  assert.equal(imported.response.status, 200);
}

async function pullSyntheticPayload(payload) {
  axiosPayload = payload;
  axiosCalls.length = 0;

  const result = await requestJson("/api/pull-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force_refresh: true }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(axiosCalls.length, 1);
  assert.match(axiosCalls[0].url, /^https:\/\/www\.dimepkairos\.com\.br\//);
  assert.equal(result.text.includes("synthetic-clock-normalization-key"), false);
  assert.equal(/api[_-]?key|authorization|\bBearer\b/i.test(result.text), false);
  return result;
}

function companyFrom(result) {
  assert.equal(result.body.total, 1);
  return result.body.companies[0];
}

test("normaliza objeto completo com contrato publico exato e sem campos extras", async () => {
  const result = await pullSyntheticPayload(completeClockPayload);
  const company = companyFrom(result);
  const clock = company.clocks[0];

  assert.deepEqual(Object.keys(clock).sort(), [
    "code",
    "fabrication_number",
    "ip",
    "ip_is_null",
    "is_communicating",
    "is_disabled",
    "last_collection_brt",
    "name",
  ]);
  assert.deepEqual(clock, {
    code: "101",
    name: "RELOGIO COMPLETO",
    fabrication_number: "SYNTH-FAB-0101",
    ip: "192.0.2.101",
    ip_is_null: false,
    last_collection_brt: "15/07/2099 09:34:56",
    is_communicating: true,
    is_disabled: false,
  });
  assert.equal(result.text.includes("synthetic-private-marker"), false);
});

test("aplica defaults atuais para campos ausentes e IP nulo", async () => {
  const result = await pullSyntheticPayload(missingValuesPayload);
  const clock = companyFrom(result).clocks[0];

  assert.deepEqual(clock, {
    code: "-",
    name: "Relogio sem nome",
    fabrication_number: "-",
    ip: "-",
    ip_is_null: true,
    last_collection_brt: "-",
    is_communicating: false,
    is_disabled: false,
  });
});

test("formata coleta em America/Sao_Paulo com data sintetica estavel", async () => {
  const payload = {
    clocks: [{
      Codigo: "150",
      Nome: "TIMEZONE FIXO",
      UltimaColeta: stableFutureCollection,
    }],
  };
  const result = await pullSyntheticPayload(payload);

  assert.equal(companyFrom(result).clocks[0].last_collection_brt, "15/07/2099 09:34:56");
});

test("infere comunicacao por coleta valida e rejeita coleta antiga", async () => {
  const result = await pullSyntheticPayload(dateInferencePayload);
  const clocks = companyFrom(result).clocks;

  assert.equal(clocks[0].last_collection_brt, "15/07/2099 09:34:56");
  assert.equal(clocks[0].is_communicating, true);
  assert.equal(clocks[1].last_collection_brt, "15/07/2000 09:34:56");
  assert.equal(clocks[1].is_communicating, false);
});

test("encontra numero de fabricacao em estrutura aninhada profunda", async () => {
  const result = await pullSyntheticPayload(deepFabricationPayload);

  assert.equal(companyFrom(result).clocks[0].fabrication_number, "SYNTH-DEEP-0301");
});

test("caracteriza IP usado como fabricacao quando fabricacao explicita falta", async () => {
  const result = await pullSyntheticPayload(ipOnlyFabricationFallbackPayload);
  const clock = companyFrom(result).clocks[0];

  assert.equal(clock.ip, "198.51.100.32");
  assert.equal(clock.fabrication_number, "198.51.100.32");
});

test("encontra listas em raiz e wrappers diretos ou recursivos", async () => {
  const observedCodes = [];

  for (const payload of wrapperPayloads) {
    const result = await pullSyntheticPayload(payload);
    observedCodes.push(companyFrom(result).clocks[0].code);
  }

  assert.deepEqual(observedCodes, ["401", "402", "403"]);
});

test("filtra entradas invalidas quando wrapper preferido contem array misto", async () => {
  const result = await pullSyntheticPayload(mixedArrayPayload);
  const company = companyFrom(result);

  assert.equal(company.active_clock_count, 1);
  assert.equal(company.clocks[0].code, "501");
});

test("caracteriza limitacao de wrapper vazio antes de lista valida ambigua", async () => {
  const result = await pullSyntheticPayload(ambiguousListPayload);
  const company = companyFrom(result);

  assert.equal(company.status, "error");
  assert.equal(company.active_clock_count, 0);
  assert.equal(company.error, "Nenhum relogio ativo encontrado.");
});

test("deduplica por fabricacao e prefere registro comunicando", async () => {
  const result = await pullSyntheticPayload(fabricationDedupPayload);
  const company = companyFrom(result);

  assert.equal(company.active_clock_count, 1);
  assert.equal(company.communicating_count, 1);
  assert.equal(company.clocks[0].code, "602");
  assert.equal(company.clocks[0].name, "FABRICACAO PREFERIDA");
});

test("deduplica por codigo normalizado e IP", async () => {
  const result = await pullSyntheticPayload(codeIpDedupPayload);
  const company = companyFrom(result);

  assert.equal(company.active_clock_count, 1);
  assert.equal(company.clocks[0].code, "701");
  assert.equal(company.clocks[0].name, "CODIGO IP PREFERIDO");
});

test("deduplica por codigo normalizado e nome quando IP e fabricacao faltam", async () => {
  const result = await pullSyntheticPayload(codeNameDedupPayload);
  const company = companyFrom(result);

  assert.equal(company.active_clock_count, 1);
  assert.equal(company.clocks[0].code, "801");
  assert.equal(company.clocks[0].last_collection_brt, "15/07/2000 09:34:56");
});

test("caracteriza preferencias por coleta, IP e nome melhor", async () => {
  const result = await pullSyntheticPayload(preferencePayload);
  const clocks = companyFrom(result).clocks;

  assert.equal(clocks.length, 3);
  assert.equal(clocks[0].code, "902");
  assert.equal(clocks[0].last_collection_brt, "15/07/2000 09:34:56");
  assert.equal(clocks[1].code, "904");
  assert.equal(clocks[1].ip, "198.51.100.94");
  assert.equal(clocks[2].code, "906");
  assert.equal(clocks[2].name, "NOME PREFERIDO");
});

test("preserva ordem da primeira identidade e calcula contadores apos deduplicacao", async () => {
  const result = await pullSyntheticPayload(orderAndCountersPayload);
  const company = companyFrom(result);

  assert.equal(company.active_clock_count, 2);
  assert.equal(company.communicating_count, 2);
  assert.equal(company.not_communicating_count, 0);
  assert.deepEqual(company.clocks.map((clock) => clock.code), ["1003", "1002"]);
  assert.equal(company.clocks.some((clock) => clock.code === "1004"), false);
});
