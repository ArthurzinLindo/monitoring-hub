const fs = require("fs");
const path = require("path");

const { sanitizeErrorForLog } = require("./errors");
const { sanitizeIdentifier } = require("./identifier");
const { normalizeKey } = require("./text");

const PULL_STATUS_PERF_LOG_FILENAME = "pull-status-performance.log";
const PULL_STATUS_PERF_LOG_MAX_BYTES = 2 * 1024 * 1024;
const PULL_STATUS_PERF_LOG_TRIM_TARGET_BYTES = Math.floor(PULL_STATUS_PERF_LOG_MAX_BYTES * 0.85);

const PERFORMANCE_LOG_SENSITIVE_JSON_KEYS = new Set([
  "api_key",
  "apikey",
  "chaveapi",
  "chave_api",
  "authorization",
  "headers",
  "header",
  "key",
  "token",
  "access_token",
  "refresh_token",
  "payload",
  "raw_payload",
  "request_payload",
  "response_payload",
  "body",
]);

function maskCnpjLikeValue(value) {
  const digits = sanitizeIdentifier(value);
  if (digits.length !== 14) {
    return "***MASKED***";
  }

  return `${"*".repeat(10)}${digits.slice(-4)}`;
}

// Sanitiza texto livre antes de gravar ou preservar historico de performance.
function sanitizePerformanceLogText(value) {
  return String(value || "")
    .replace(/"(api[_\s-]?key|apikey|chave[_\s-]?api|chaveapi|authorization|headers?|key|token|access_token|refresh_token|payload|raw_payload|request_payload|response_payload|body)"\s*:\s*(?:"[^"]*"|\{[^}\n]*\}|\[[^\]\n]*\]|[^,}\]\n]+)/gi, (_match, key) => `"${key}":"***REDACTED***"`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***REDACTED***")
    .replace(/\b(api[_\s-]?key|apikey|chave[_\s-]?api|chaveapi|authorization|token|access_token|refresh_token)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi, (_match, key) => `${key}: ***REDACTED***`)
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (match) => maskCnpjLikeValue(match))
    .replace(/(?<!\d)\d{14}(?!\d)/g, (match) => maskCnpjLikeValue(match));
}

function isSensitivePerformanceLogKey(key) {
  const normalizedKey = normalizeKey(key);
  return PERFORMANCE_LOG_SENSITIVE_JSON_KEYS.has(normalizedKey);
}

// Serializa payload estruturado redigindo chaves sensiveis antes do fallback textual.
function stringifyPerformanceLogPayload(payload) {
  const json = JSON.stringify(payload, (key, value) => {
    if (isSensitivePerformanceLogKey(key)) {
      return "***REDACTED***";
    }

    if (typeof value === "string") {
      return sanitizePerformanceLogText(value);
    }

    return value;
  });

  return sanitizePerformanceLogText(json);
}

function trimPerformanceLogTextToLimit(text, targetBytes = PULL_STATUS_PERF_LOG_TRIM_TARGET_BYTES) {
  const lines = sanitizePerformanceLogText(text)
    .split(/\r?\n/)
    .filter((line) => line.trim());

  const keptLines = [];
  let totalBytes = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (keptLines.length && totalBytes + lineBytes > targetBytes) {
      break;
    }

    keptLines.push(line);
    totalBytes += lineBytes;
  }

  return keptLines.length ? `${keptLines.reverse().join("\n")}\n` : "";
}

function sanitizeAndLimitPerformanceLogFile(logPath) {
  if (!fs.existsSync(logPath)) {
    return;
  }

  const originalText = fs.readFileSync(logPath, "utf8");
  const sanitizedText = sanitizePerformanceLogText(originalText);
  const nextText = Buffer.byteLength(sanitizedText, "utf8") > PULL_STATUS_PERF_LOG_MAX_BYTES
    ? trimPerformanceLogTextToLimit(sanitizedText)
    : sanitizedText;

  if (nextText !== originalText) {
    fs.writeFileSync(logPath, nextText, "utf8");
  }
}

function enforcePerformanceLogLimit(logPath) {
  const stat = fs.statSync(logPath);
  if (stat.size <= PULL_STATUS_PERF_LOG_MAX_BYTES) {
    return;
  }

  const currentText = fs.readFileSync(logPath, "utf8");
  fs.writeFileSync(logPath, trimPerformanceLogTextToLimit(currentText), "utf8");
}

function createPerformanceLogger({ getDataDir, startupLog = () => {} }) {
  let prepared = false;

  function getLogPath() {
    return path.join(getDataDir(), PULL_STATUS_PERF_LOG_FILENAME);
  }

  function prepareLogFile() {
    if (prepared) {
      return;
    }

    prepared = true;

    try {
      const dataDir = getDataDir();
      fs.mkdirSync(dataDir, { recursive: true });
      sanitizeAndLimitPerformanceLogFile(getLogPath());
    } catch (error) {
      startupLog("pull_status_performance_log_prepare_failed", {
        error: sanitizeErrorForLog(error),
      });
    }
  }

  function appendLog(payload) {
    try {
      const dataDir = getDataDir();
      fs.mkdirSync(dataDir, { recursive: true });
      const logPath = getLogPath();
      prepareLogFile();
      fs.appendFileSync(logPath, `[pull-status] ${stringifyPerformanceLogPayload(payload)}\n`, "utf8");
      enforcePerformanceLogLimit(logPath);
    } catch {
      // Log de performance e diagnostico; falha aqui nao pode afetar a consulta.
    }
  }

  return {
    appendLog,
    getLogPath,
    prepareLogFile,
  };
}

module.exports = {
  PULL_STATUS_PERF_LOG_FILENAME,
  PULL_STATUS_PERF_LOG_MAX_BYTES,
  PULL_STATUS_PERF_LOG_TRIM_TARGET_BYTES,
  createPerformanceLogger,
  sanitizeAndLimitPerformanceLogFile,
  sanitizePerformanceLogText,
  stringifyPerformanceLogPayload,
  trimPerformanceLogTextToLimit,
};
