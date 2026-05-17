const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isNullIp,
  normalizeClockCode,
  buildClockIdentityKey,
} = require("../../src/utils/clock");

test("normalizeClockCode extrai codigo numerico estavel", () => {
  assert.equal(normalizeClockCode("Codigo 3519"), "3519");
  assert.equal(normalizeClockCode(" 001 "), "001");
  assert.equal(normalizeClockCode("Relogio-A"), "relogioa");
});

test("isNullIp identifica IP nulo ou vazio", () => {
  assert.equal(isNullIp(null), true);
  assert.equal(isNullIp(undefined), true);
  assert.equal(isNullIp(""), true);
  assert.equal(isNullIp("null"), true);
  assert.equal(isNullIp("192.168.0.10"), false);
});

test("buildClockIdentityKey gera identidade estavel priorizando numero de fabricacao", () => {
  const clock = {
    code: "28",
    name: "Viva 18 andar",
    ip: "192.168.0.10",
    fabrication_number: "8008772",
  };

  assert.equal(buildClockIdentityKey(clock), "fabrication:8008772");
});

test("buildClockIdentityKey usa codigo e IP quando nao ha numero de fabricacao", () => {
  assert.equal(
    buildClockIdentityKey({
      code: "Codigo 28",
      name: "Viva 18 andar",
      ip: "192.168.0.10",
      fabrication_number: "-",
    }),
    "code-ip:28:192168010",
  );
});
