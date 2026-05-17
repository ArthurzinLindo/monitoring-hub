const test = require("node:test");
const assert = require("node:assert/strict");

const {
  companyToPublic,
  normalizeSystem,
  maskApiKey,
} = require("../../src/utils/company");

test("companyToPublic remove api_key e mantem campos publicos", () => {
  const publicCompany = companyToPublic({
    id: "empresa-1",
    name: "Empresa Teste",
    identifier: "12.345.678/0001-90",
    system: "DIMEP",
    api_key: "segredo",
  });

  assert.deepEqual(publicCompany, {
    id: "empresa-1",
    name: "Empresa Teste",
    identifier: "12.345.678/0001-90",
    system: "DIMEP",
  });
  assert.equal(Object.hasOwn(publicCompany, "api_key"), false);
});

test("normalizeSystem reconhece DIMEP e MADIS", () => {
  assert.equal(normalizeSystem("DIMEP"), "DIMEP");
  assert.equal(normalizeSystem("Sistema MADIS"), "MADIS");
  assert.equal(normalizeSystem("mdcomune"), "MADIS");
});

test("normalizeSystem rejeita sistema invalido", () => {
  assert.equal(normalizeSystem("outro"), null);
  assert.equal(normalizeSystem(""), null);
});

test("maskApiKey mascara segredo mantendo apenas pontas quando aplicavel", () => {
  assert.equal(maskApiKey("e0f70f7a-eb31-47c9-b643-a2d7f5ae7c4d"), "e0f7...7c4d");
  assert.equal(maskApiKey("curta"), "********");
  assert.equal(maskApiKey(""), "");
});
