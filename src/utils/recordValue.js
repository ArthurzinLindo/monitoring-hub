const { normalizeKey } = require("./text");

function parseBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Boolean(value);
  if (value === null || value === undefined) return null;

  const text = normalizeKey(String(value));
  if (["true", "1", "sim", "yes", "y", "online", "comunicando", "conectado", "ativo"].includes(text)) {
    return true;
  }
  if (["false", "0", "nao", "na", "no", "n", "offline", "desconectado", "inativo"].includes(text)) {
    return false;
  }
  return null;
}

function isPrimitiveRecordValue(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function extractPrimitiveRecordValue(node, depth = 0) {
  if (depth > 5 || node === undefined || node === null) {
    return null;
  }

  if (isPrimitiveRecordValue(node)) {
    return node;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractPrimitiveRecordValue(item, depth + 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
    return null;
  }

  if (typeof node !== "object") {
    return null;
  }

  // Prioriza chaves comuns quando valor vem encapsulado em objeto.
  const preferredKeys = ["value", "valor", "text", "texto", "name", "nome", "description", "descricao"];
  const entries = Object.entries(node);

  for (const preferredKey of preferredKeys) {
    const match = entries.find(([rawKey]) => normalizeKey(rawKey) === preferredKey);
    if (match) {
      const found = extractPrimitiveRecordValue(match[1], depth + 1);
      if (found !== undefined && found !== null && found !== "") {
        return found;
      }
    }
  }

  for (const [, value] of entries) {
    const found = extractPrimitiveRecordValue(value, depth + 1);
    if (found !== undefined && found !== null && found !== "") {
      return found;
    }
  }

  return null;
}

function collectNormalizedRecordValues(node, normalizedRecord, visited, depth = 0) {
  if (depth > 5 || node === undefined || node === null) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => collectNormalizedRecordValues(item, normalizedRecord, visited, depth + 1));
    return;
  }

  if (typeof node !== "object") {
    return;
  }

  if (visited.has(node)) {
    return;
  }
  visited.add(node);

  Object.entries(node).forEach(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey && !normalizedRecord.has(normalizedKey)) {
      const extracted = extractPrimitiveRecordValue(value, depth + 1);
      if (extracted !== undefined && extracted !== null && extracted !== "") {
        normalizedRecord.set(normalizedKey, extracted);
      }
    }

    if (value && typeof value === "object") {
      collectNormalizedRecordValues(value, normalizedRecord, visited, depth + 1);
    }
  });
}

function getValueFromRecord(record, aliases) {
  const normalizedRecord = new Map();
  collectNormalizedRecordValues(record || {}, normalizedRecord, new WeakSet());

  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    const value = normalizedRecord.get(normalizedAlias);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  // Fallback: algumas APIs retornam nomes expandidos (ex: NumeroDeFabricacaoDoEquipamento).
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (normalizedAlias.length < 6) {
      continue;
    }

    for (const [key, value] of normalizedRecord.entries()) {
      if (key.includes(normalizedAlias) || normalizedAlias.includes(key)) {
        if (value !== undefined && value !== null && value !== "") {
          return value;
        }
      }
    }
  }

  return null;
}

module.exports = {
  collectNormalizedRecordValues,
  extractPrimitiveRecordValue,
  getValueFromRecord,
  isPrimitiveRecordValue,
  parseBool,
};
