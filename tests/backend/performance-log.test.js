const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PULL_STATUS_PERF_LOG_FILENAME,
  PULL_STATUS_PERF_LOG_MAX_BYTES,
  createPerformanceLogger,
  sanitizePerformanceLogText,
  stringifyPerformanceLogPayload,
  trimPerformanceLogTextToLimit,
} = require("../../src/utils/performanceLog");

test("sanitizePerformanceLogText mascara CNPJ formatado e sequencia de 14 digitos", () => {
  const input = 'empresa 12.345.678/0001-90 id 12345678000190';
  const sanitized = sanitizePerformanceLogText(input);

  assert.equal(sanitized.includes("12.345.678/0001-90"), false);
  assert.equal(sanitized.includes("12345678000190"), false);
  assert.match(sanitized, /\*{10}0190/);
});

test("sanitizePerformanceLogText remove tokens e authorization sem expor segredo", () => {
  const input = 'authorization: Bearer abcdefghijklmnop token=secret-token-123456789';
  const sanitized = sanitizePerformanceLogText(input);

  assert.equal(sanitized.includes("abcdefghijklmnop"), false);
  assert.equal(sanitized.includes("secret-token-123456789"), false);
  assert.match(sanitized, /Bearer \*\*\*REDACTED\*\*\*/);
  assert.match(sanitized, /token: \*\*\*REDACTED\*\*\*/);
});

test("stringifyPerformanceLogPayload redige campos sensiveis e preserva metricas uteis", () => {
  const serialized = stringifyPerformanceLogPayload({
    event: "completed",
    endpoint_total_ms: 1234,
    companies_processed: 2,
    api_key: "abc123456789secret",
    headers: { authorization: "Bearer abc123456789secret" },
    payload: { TodosRelogios: true },
    identifier: "12.345.678/0001-90",
  });

  assert.equal(serialized.includes("abc123456789secret"), false);
  assert.equal(serialized.includes("12.345.678/0001-90"), false);
  assert.equal(serialized.includes("12345678000190"), false);
  assert.equal(serialized.includes("TodosRelogios"), false);
  assert.match(serialized, /"endpoint_total_ms":1234/);
  assert.match(serialized, /"companies_processed":2/);
});

test("trimPerformanceLogTextToLimit mantem linhas finais sanitizadas", () => {
  const oldSensitiveLine = `[pull-status] {"event":"completed","identifier":"12.345.678/0001-90"}\n`;
  const safeLines = Array.from({ length: 20 }, (_item, index) => (
    `[pull-status] {"event":"completed","endpoint_total_ms":${index},"request_id":"manual-${index}"}`
  )).join("\n");

  const trimmed = trimPerformanceLogTextToLimit(`${oldSensitiveLine}${safeLines}\n`, 450);

  assert.ok(Buffer.byteLength(trimmed, "utf8") <= PULL_STATUS_PERF_LOG_MAX_BYTES);
  assert.equal(trimmed.includes("12.345.678/0001-90"), false);
  assert.equal(trimmed.includes("manual-19"), true);
  assert.equal(trimmed.endsWith("\n"), true);
});

test("createPerformanceLogger sanitiza historico e escreve novo registro seguro", () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitoring-hub-log-tests-"));
  const logPath = path.join(tempDataDir, PULL_STATUS_PERF_LOG_FILENAME);

  try {
    fs.writeFileSync(
      logPath,
      `[pull-status] {"event":"completed","identifier":"12.345.678/0001-90","authorization":"Bearer secret-token-123456"}\n`,
      "utf8",
    );

    const logger = createPerformanceLogger({
      getDataDir: () => tempDataDir,
      startupLog: () => {},
    });

    logger.prepareLogFile();
    logger.appendLog({
      event: "completed",
      endpoint_total_ms: 120,
      identifier: "12345678000190",
      api_key: "secretapikey123456",
      body: { TodosRelogios: true },
    });

    const text = fs.readFileSync(logPath, "utf8");

    assert.equal(text.includes("12.345.678/0001-90"), false);
    assert.equal(text.includes("12345678000190"), false);
    assert.equal(text.includes("secret-token-123456"), false);
    assert.equal(text.includes("secretapikey123456"), false);
    assert.equal(text.includes("TodosRelogios"), false);
    assert.match(text, /"endpoint_total_ms":120/);
  } finally {
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
});
