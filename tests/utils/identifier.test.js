const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeIdentifier,
  normalizeIdentifier,
  buildIdentifierCandidates,
} = require("../../src/utils/identifier");

test("sanitizeIdentifier mantem apenas numeros do CNPJ", () => {
  assert.equal(sanitizeIdentifier("36.393.750/0001-18"), "36393750000118");
});

test("sanitizeIdentifier trata valor vazio", () => {
  assert.equal(sanitizeIdentifier(""), "");
  assert.equal(sanitizeIdentifier(null), "");
  assert.equal(sanitizeIdentifier(undefined), "");
});

test("normalizeIdentifier preserva CNPJ formatado sem espacos externos", () => {
  assert.equal(normalizeIdentifier(" 36.393.750/0001-18 "), "36.393.750/0001-18");
});

test("buildIdentifierCandidates gera candidatos sem duplicar valores", () => {
  assert.deepEqual(buildIdentifierCandidates("36.393.750/0001-18"), [
    "36.393.750/0001-18",
    "36393750000118",
  ]);

  assert.deepEqual(buildIdentifierCandidates("36393750000118"), [
    "36393750000118",
    "36.393.750/0001-18",
  ]);
});
