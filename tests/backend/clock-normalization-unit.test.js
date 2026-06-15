const test = require("node:test");
const assert = require("node:assert/strict");

const {
  choosePreferredClock,
  dedupeClocks,
  findClockList,
  findFabricationNumberFallback,
  normalizeClockItem,
} = require("../../src/services/clockNormalization");
const {
  ambiguousListPayload,
  completeClockPayload,
  dateInferencePayload,
  deepFabricationPayload,
  missingValuesPayload,
  stableFutureCollection,
  wrapperPayloads,
} = require("../fixtures/clockNormalizationPayloads");

function normalizedClock(overrides = {}) {
  return {
    code: "1",
    name: "RELOGIO BASE",
    fabrication_number: "FAB-BASE",
    ip: "192.0.2.1",
    ip_is_null: false,
    last_collection_brt: "15/07/2099 09:34:56",
    is_communicating: false,
    is_disabled: false,
    ...overrides,
  };
}

test("normalizeClockItem preserva contrato completo e defaults", () => {
  const complete = normalizeClockItem(completeClockPayload.data.clocks[0]);
  const missing = normalizeClockItem(missingValuesPayload.Relogios[0]);

  assert.deepEqual(complete, {
    code: "101",
    name: "RELOGIO COMPLETO",
    fabrication_number: "SYNTH-FAB-0101",
    ip: "192.0.2.101",
    ip_is_null: false,
    last_collection_brt: "15/07/2099 09:34:56",
    is_communicating: true,
    is_disabled: false,
  });
  assert.deepEqual(missing, {
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

test("normalizeClockItem preserva inferencia e vencimento de comunicacao", () => {
  const future = normalizeClockItem(dateInferencePayload.resultado[0]);
  const stale = normalizeClockItem(dateInferencePayload.resultado[1]);

  assert.equal(future.is_communicating, true);
  assert.equal(future.last_collection_brt, "15/07/2099 09:34:56");
  assert.equal(stale.is_communicating, false);
  assert.equal(stale.last_collection_brt, "15/07/2000 09:34:56");
});

test("findFabricationNumberFallback preserva busca profunda e prioridade", () => {
  const deepRecord = deepFabricationPayload.envelope.result[0];
  const prioritizedRecord = {
    Serial: "SERIAL-LOW",
    detalhes: {
      NumeroDeFabricacaoInterno: "FAB-HIGH",
    },
  };

  assert.equal(findFabricationNumberFallback(deepRecord), "SYNTH-DEEP-0301");
  assert.equal(findFabricationNumberFallback(prioritizedRecord), "FAB-HIGH");
  assert.equal(findFabricationNumberFallback({ Codigo: "1" }), null);
});

test("findClockList preserva wrappers aceitos e limitacao de wrapper vazio", () => {
  assert.equal(findClockList(wrapperPayloads[0])[0].Codigo, "401");
  assert.equal(findClockList(wrapperPayloads[1])[0].Codigo, "402");
  assert.equal(findClockList(wrapperPayloads[2])[0].Codigo, "403");
  assert.deepEqual(findClockList(ambiguousListPayload), []);
  assert.equal(findClockList({ valor: "sem-lista" }), null);
});

test("choosePreferredClock preserva a ordem atual de prioridades", () => {
  const existing = normalizedClock({
    name: "Relogio sem nome",
    fabrication_number: "-",
    ip: "-",
    last_collection_brt: "-",
  });

  const communicating = normalizedClock({ code: "2", is_communicating: true });
  const collected = normalizedClock({ code: "3", is_communicating: false });
  const withIp = normalizedClock({
    code: "4",
    is_communicating: false,
    last_collection_brt: "-",
  });
  const withFabrication = normalizedClock({
    code: "5",
    is_communicating: false,
    last_collection_brt: "-",
    ip: "-",
  });
  const withName = normalizedClock({
    code: "6",
    is_communicating: false,
    last_collection_brt: "-",
    ip: "-",
    fabrication_number: "-",
  });

  assert.equal(choosePreferredClock(existing, communicating), communicating);
  assert.equal(choosePreferredClock(existing, collected), collected);
  assert.equal(choosePreferredClock(existing, withIp), withIp);
  assert.equal(choosePreferredClock(existing, withFabrication), withFabrication);
  assert.equal(choosePreferredClock(existing, withName), withName);
  assert.equal(choosePreferredClock(normalizedClock(), normalizedClock({ code: "7" })).code, "1");
});

test("dedupeClocks preserva identidade por fabricacao", () => {
  const first = normalizedClock({
    code: "10",
    fabrication_number: "FAB-DUP",
    is_communicating: false,
  });
  const preferred = normalizedClock({
    code: "11",
    fabrication_number: "FAB-DUP",
    is_communicating: true,
  });

  assert.deepEqual(dedupeClocks([first, preferred]), [preferred]);
});

test("dedupeClocks preserva identidades por codigo IP e codigo nome", () => {
  const codeIpFirst = normalizedClock({
    code: "20-LEGACY",
    fabrication_number: "-",
    ip: "198.51.100.20",
    is_communicating: false,
  });
  const codeIpPreferred = normalizedClock({
    code: "20",
    fabrication_number: "-",
    ip: "198.51.100.20",
    is_communicating: true,
  });
  const codeNameFirst = normalizedClock({
    code: "30-LEGACY",
    name: "MESMO NOME",
    fabrication_number: "-",
    ip: "-",
    ip_is_null: true,
    last_collection_brt: "-",
  });
  const codeNamePreferred = normalizedClock({
    code: "30",
    name: "MESMO NOME",
    fabrication_number: "-",
    ip: "-",
    ip_is_null: true,
    last_collection_brt: "15/07/2099 09:34:56",
  });

  assert.deepEqual(dedupeClocks([codeIpFirst, codeIpPreferred]), [codeIpPreferred]);
  assert.deepEqual(dedupeClocks([codeNameFirst, codeNamePreferred]), [codeNamePreferred]);
});

test("dedupeClocks preserva a posicao da primeira identidade substituida", () => {
  const first = normalizedClock({
    code: "40",
    fabrication_number: "FAB-ORDER-1",
    is_communicating: false,
  });
  const second = normalizedClock({
    code: "41",
    fabrication_number: "FAB-ORDER-2",
    is_communicating: true,
  });
  const preferred = normalizedClock({
    code: "42",
    fabrication_number: "FAB-ORDER-1",
    is_communicating: true,
  });

  assert.deepEqual(dedupeClocks([first, second, preferred]).map((clock) => clock.code), ["42", "41"]);
});

test("normalizeClockItem mantem timezone America/Sao_Paulo", () => {
  const clock = normalizeClockItem({
    Codigo: "50",
    UltimaColeta: stableFutureCollection,
  });

  assert.equal(clock.last_collection_brt, "15/07/2099 09:34:56");
});
