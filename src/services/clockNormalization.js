const { normalizeKey } = require("../utils/text");
const {
  parseDateUtc,
  formatBrazilDatetime,
  isStaleCollection,
} = require("../utils/datetime");
const {
  isNullIp,
  buildClockIdentityKey,
} = require("../utils/clock");
const {
  extractPrimitiveRecordValue,
  getValueFromRecord,
  parseBool,
} = require("../utils/recordValue");

const MAX_COLLECTION_AGE_MS = 60 * 60 * 1000;

const CLOCK_FIELD_ALIASES = {
  disabled: ["relogiodesativado", "relogio desativado", "isdisabled", "disabled"],
  code: [
    "codigo",
    "codigorelogio",
    "cod",
    "clockid",
    "idrelogio",
    "id",
    "relogionumero",
    "numerorelogio",
    "clocknumber",
    "numero",
  ],
  name: ["nome", "nomerelogio", "relogionome", "descricao", "clockname"],
  // Alias para campo solicitado no painel: NumeroFabricacao.
  fabrication_number: [
    "numerofabricacao",
    "numero fabricacao",
    "numero de fabricacao",
    "fabricacao",
    "numerofabricacaorelogio",
    "numerofabricacaoequipamento",
    "numerodeserieequipamento",
    "numeroserie",
    "numeroserial",
    "nroserie",
    "nroserial",
    "numerodeserie",
    "numero de serie",
    "serialnumber",
    "serial",
  ],
  ip: ["ip", "enderecoip", "endereco ip", "iprelogio", "relogioip", "host"],
  last_collection: [
    "ultimacoleta",
    "ultimostatus",
    "datahoraultimacoleta",
    "lastcollection",
    "ultimacomunicacao",
    "dataultimacomunicacao",
  ],
  communicating: ["comunicando", "emcomunicacao", "statuscomunicacao", "iscommunicating", "online"],
};

function findFabricationNumberFallback(record) {
  const candidates = [];
  const visited = new WeakSet();

  function visit(node, depth = 0) {
    if (depth > 6 || node === undefined || node === null) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    if (visited.has(node)) {
      return;
    }
    visited.add(node);

    Object.entries(node).forEach(([rawKey, value]) => {
      const key = normalizeKey(rawKey);
      if (!key) {
        return;
      }

      const isFabricationKey =
        key.includes("numerofabricacao") ||
        key.includes("fabricacao") ||
        key.includes("numerodeserie") ||
        key.includes("numeroserie") ||
        key.includes("numeroserial") ||
        key.includes("serialnumber") ||
        key.includes("serial") ||
        key.includes("serie");

      if (isFabricationKey) {
        const primitive = extractPrimitiveRecordValue(value, depth + 1);
        const text = String(primitive ?? "").trim();
        if (text && normalizeKey(text) !== "null") {
          let score = 1;
          if (key.includes("numerofabricacao")) score = 5;
          else if (key.includes("numerodeserie") || key.includes("numeroserie") || key.includes("numeroserial")) score = 4;
          else if (key.includes("serialnumber")) score = 3;
          else if (key.includes("fabricacao")) score = 2;
          candidates.push({ score, value: text });
        }
      }

      if (value && typeof value === "object") {
        visit(value, depth + 1);
      }
    });
  }

  visit(record);
  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].value;
}

function choosePreferredClock(existing, candidate) {
  if (!existing.is_communicating && candidate.is_communicating) {
    return candidate;
  }
  if (existing.last_collection_brt === "-" && candidate.last_collection_brt !== "-") {
    return candidate;
  }
  if (existing.ip === "-" && candidate.ip !== "-") {
    return candidate;
  }
  if (existing.fabrication_number === "-" && candidate.fabrication_number !== "-") {
    return candidate;
  }
  if (existing.name === "Relogio sem nome" && candidate.name !== "Relogio sem nome") {
    return candidate;
  }
  return existing;
}

function dedupeClocks(clocks) {
  const uniqueClocks = new Map();

  for (const clock of clocks) {
    const key = buildClockIdentityKey(clock);
    const existing = uniqueClocks.get(key);
    uniqueClocks.set(key, existing ? choosePreferredClock(existing, clock) : clock);
  }

  return [...uniqueClocks.values()];
}

function normalizeClockItem(record) {
  let communicationFlag = parseBool(getValueFromRecord(record, CLOCK_FIELD_ALIASES.communicating));
  const disabled = parseBool(getValueFromRecord(record, CLOCK_FIELD_ALIASES.disabled));

  const code = getValueFromRecord(record, CLOCK_FIELD_ALIASES.code);
  const name = getValueFromRecord(record, CLOCK_FIELD_ALIASES.name);
  const fabricationNumberRaw =
    getValueFromRecord(record, CLOCK_FIELD_ALIASES.fabrication_number) ||
    findFabricationNumberFallback(record);
  const fabricationNumber = String(fabricationNumberRaw || "").trim();
  const ipRaw = getValueFromRecord(record, CLOCK_FIELD_ALIASES.ip);
  const lastCollection = getValueFromRecord(record, CLOCK_FIELD_ALIASES.last_collection);
  const ipIsNull = isNullIp(ipRaw);

  if (communicationFlag === null) {
    communicationFlag = parseDateUtc(lastCollection) !== null;
  }

  if (isStaleCollection(lastCollection, MAX_COLLECTION_AGE_MS)) {
    communicationFlag = false;
  }

  return {
    code: String(code || "-"),
    name: String(name || "Relogio sem nome"),
    // Mantem valor pronto para exibir no card do modal.
    fabrication_number: fabricationNumber || "-",
    ip: ipIsNull ? "-" : String(ipRaw).trim(),
    ip_is_null: ipIsNull,
    last_collection_brt: formatBrazilDatetime(lastCollection),
    is_communicating: Boolean(communicationFlag),
    is_disabled: Boolean(disabled),
  };
}

function findClockList(node) {
  if (Array.isArray(node)) {
    if (!node.length) return [];
    if (node.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return node;
    }
    return null;
  }

  if (!node || typeof node !== "object") {
    return null;
  }

  const preferredKeys = new Set(["relogios", "clocklist", "clocks", "lista", "items", "dados", "data", "resultado", "result", "obj"]);

  for (const [key, value] of Object.entries(node)) {
    if (preferredKeys.has(normalizeKey(key)) && Array.isArray(value)) {
      return value;
    }
  }

  for (const value of Object.values(node)) {
    const found = findClockList(value);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

module.exports = {
  choosePreferredClock,
  dedupeClocks,
  findClockList,
  findFabricationNumberFallback,
  normalizeClockItem,
};
