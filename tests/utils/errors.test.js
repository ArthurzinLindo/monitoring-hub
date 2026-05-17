const test = require("node:test");
const assert = require("node:assert/strict");

const {
  redactSensitiveText,
  sanitizeErrorForLog,
} = require("../../src/utils/errors");

test("redactSensitiveText mascara api_key conhecida", () => {
  const apiKey = "e0f70f7a-eb31-47c9-b643-a2d7f5ae7c4d";
  const message = `Erro usando ${apiKey}`;

  const redacted = redactSensitiveText(message, [apiKey]);

  assert.equal(redacted.includes(apiKey), false);
  assert.equal(redacted.includes("e0f7...7c4d"), true);
});

test("redactSensitiveText remove campos sensiveis de mensagens publicas", () => {
  const redacted = redactSensitiveText("falha api_key: e0f70f7a-eb31-47c9-b643-a2d7f5ae7c4d");

  assert.equal(redacted, "falha api_key: ********");
});

test("sanitizeErrorForLog nao expoe segredo em mensagem de erro", () => {
  const apiKey = "11b345c7-6790-4df6-a0fb-7b4bee3a2447";
  const error = new Error(`Falha com key=${apiKey}`);

  const sanitized = sanitizeErrorForLog(error);

  assert.equal(JSON.stringify(sanitized).includes(apiKey), false);
  assert.equal(sanitized.message.includes("key: ********"), true);
});
