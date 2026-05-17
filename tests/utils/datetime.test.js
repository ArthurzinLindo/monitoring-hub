const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDateUtc,
  isStaleCollection,
} = require("../../src/utils/datetime");

const ONE_HOUR_MS = 60 * 60 * 1000;

test("isStaleCollection identifica ultima coleta acima de 1 hora como vencida", () => {
  const oldDate = new Date(Date.now() - ONE_HOUR_MS - 1000).toISOString();
  assert.equal(isStaleCollection(oldDate, ONE_HOUR_MS), true);
});

test("isStaleCollection identifica ultima coleta recente como valida", () => {
  const recentDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(isStaleCollection(recentDate, ONE_HOUR_MS), false);
});

test("parseDateUtc e isStaleCollection nao quebram com data vazia ou invalida", () => {
  assert.equal(parseDateUtc(""), null);
  assert.equal(parseDateUtc("data-invalida"), null);
  assert.equal(isStaleCollection("", ONE_HOUR_MS), false);
  assert.equal(isStaleCollection("data-invalida", ONE_HOUR_MS), false);
});
