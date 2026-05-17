const { maskApiKey } = require("./company");

const SENSITIVE_FIELD_PATTERN = /(api[_\s-]?key|apikey|chave[_\s-]?api|key|authorization)\s*[:=]\s*["']?([a-z0-9._-]{8,})/gi;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redactSensitiveText(value, secrets = []) {
  let text = String(value || "");

  for (const secret of secrets) {
    const rawSecret = String(secret || "").trim();
    if (!rawSecret) {
      continue;
    }
    text = text.replace(new RegExp(escapeRegExp(rawSecret), "g"), maskApiKey(rawSecret));
  }

  return text.replace(SENSITIVE_FIELD_PATTERN, (_match, label) => `${label}: ********`);
}

function createPublicError(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}

function getPublicErrorMessage(error, fallbackMessage) {
  return error?.publicMessage || fallbackMessage;
}

function sanitizeErrorForLog(error, metadata = {}) {
  const status = error?.response?.status;
  const safeMetadata = {};

  for (const [key, value] of Object.entries(metadata || {})) {
    safeMetadata[key] = redactSensitiveText(value);
  }

  return {
    name: error?.name || "Error",
    message: redactSensitiveText(error?.message || "Erro sem mensagem."),
    code: error?.code,
    status,
    ...safeMetadata,
  };
}

module.exports = {
  redactSensitiveText,
  createPublicError,
  getPublicErrorMessage,
  sanitizeErrorForLog,
};
