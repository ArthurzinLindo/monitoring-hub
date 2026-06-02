const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectNormalizedRecordValues,
  extractPrimitiveRecordValue,
  getValueFromRecord,
  isPrimitiveRecordValue,
  parseBool,
} = require("../../src/utils/recordValue");
const {
  dimepClockRecord,
  madisClockRecord,
} = require("../fixtures/clockRecords");

test("parseBool preserva booleanos e numeros", () => {
  assert.equal(parseBool(true), true);
  assert.equal(parseBool(false), false);
  assert.equal(parseBool(1), true);
  assert.equal(parseBool(0), false);
});

test("parseBool reconhece strings em portugues e ingles", () => {
  assert.equal(parseBool("sim"), true);
  assert.equal(parseBool("conectado"), true);
  assert.equal(parseBool("online"), true);
  assert.equal(parseBool("yes"), true);
  assert.equal(parseBool("nao"), false);
  assert.equal(parseBool("desconectado"), false);
  assert.equal(parseBool("offline"), false);
  assert.equal(parseBool("no"), false);
});

test("parseBool retorna null para valores ausentes ou invalidos", () => {
  assert.equal(parseBool(null), null);
  assert.equal(parseBool(undefined), null);
  assert.equal(parseBool("talvez"), null);
  assert.equal(parseBool({ value: true }), null);
});

test("isPrimitiveRecordValue identifica apenas primitivos aceitos", () => {
  assert.equal(isPrimitiveRecordValue("texto"), true);
  assert.equal(isPrimitiveRecordValue(12), true);
  assert.equal(isPrimitiveRecordValue(false), true);
  assert.equal(isPrimitiveRecordValue(null), false);
  assert.equal(isPrimitiveRecordValue({}), false);
  assert.equal(isPrimitiveRecordValue([]), false);
});

test("extractPrimitiveRecordValue retorna valor primitivo simples", () => {
  assert.equal(extractPrimitiveRecordValue("MD REP"), "MD REP");
  assert.equal(extractPrimitiveRecordValue(42), 42);
  assert.equal(extractPrimitiveRecordValue(false), false);
});

test("extractPrimitiveRecordValue busca valor em objeto aninhado priorizando chaves comuns", () => {
  assert.equal(
    extractPrimitiveRecordValue({
      meta: "ignorado",
      valor: {
        texto: "Relogio Central",
      },
    }),
    "Relogio Central",
  );
});

test("extractPrimitiveRecordValue busca primeiro valor valido em array", () => {
  assert.equal(extractPrimitiveRecordValue([null, "", { value: "ABC123" }]), "ABC123");
  assert.equal(extractPrimitiveRecordValue([null, "", undefined]), null);
});

test("collectNormalizedRecordValues normaliza chaves e ignora valores vazios", () => {
  const normalizedRecord = new Map();
  collectNormalizedRecordValues(
    {
      "Numero de Fabricacao": { valor: "FAB-001" },
      vazio: "",
      detalhe: { Nome: "Relogio 1" },
    },
    normalizedRecord,
    new WeakSet(),
  );

  assert.equal(normalizedRecord.get("numerodefabricacao"), "FAB-001");
  assert.equal(normalizedRecord.get("nome"), "Relogio 1");
  assert.equal(normalizedRecord.has("vazio"), false);
});

test("getValueFromRecord encontra valor por alias exato", () => {
  const record = {
    dados: {
      CodigoRelogio: { value: "003" },
    },
  };

  assert.equal(getValueFromRecord(record, ["codigo relogio", "codigo"]), "003");
});

test("getValueFromRecord usa fallback para chaves expandidas", () => {
  const record = {
    NumeroDeFabricacaoDoEquipamento: "FAB-999",
  };

  assert.equal(getValueFromRecord(record, ["numero de fabricacao"]), "FAB-999");
});

test("getValueFromRecord retorna null quando alias nao existe", () => {
  assert.equal(getValueFromRecord({ codigo: "1" }, ["ip"]), null);
  assert.equal(getValueFromRecord(null, ["codigo"]), null);
});

test("getValueFromRecord extrai campos comuns de fixtures sinteticas de relogios", () => {
  assert.equal(getValueFromRecord(dimepClockRecord, ["codigo", "codigorelogio"]), "003");
  assert.equal(getValueFromRecord(dimepClockRecord, ["numero fabricacao", "numerofabricacao"]), "FAB-0003");
  assert.equal(parseBool(getValueFromRecord(dimepClockRecord, ["comunicando"])), false);

  assert.equal(getValueFromRecord(madisClockRecord, ["codigo relogio", "codigorelogio"]), "7");
  assert.equal(getValueFromRecord(madisClockRecord, ["descricao", "nome"]), "MADIS OUTLET");
  assert.equal(getValueFromRecord(madisClockRecord, ["numero de fabricacao"]), "MADIS-0007");
  assert.equal(parseBool(getValueFromRecord(madisClockRecord, ["status comunicacao"])), true);
});
