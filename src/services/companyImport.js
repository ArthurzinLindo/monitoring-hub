const { normalizeSystem } = require("../utils/company");
const { createPublicError } = require("../utils/errors");
const {
  sanitizeIdentifier,
  normalizeIdentifier,
} = require("../utils/identifier");
const { normalizeKey } = require("../utils/text");

const COMPANY_COLUMN_ALIASES = {
  name: ["nome da empresa", "empresa", "nome", "razao social", "razaosocial"],
  identifier: ["cnpj", "identifier", "identificador"],
  api_key: ["api key", "apikey", "key", "chave", "chave api", "chaveapi"],
  system: ["sistema", "fornecedor", "plataforma", "api"],
};

let xlsxModule = null;

function getXlsx() {
  if (!xlsxModule) {
    xlsxModule = require("xlsx");
  }
  return xlsxModule;
}

function loadRows(fileName, rawFile) {
  const XLSX = getXlsx();
  const workbook = XLSX.read(rawFile, { type: "buffer", raw: false });
  if (!workbook.SheetNames.length) return [];
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
}

function buildColumnLookup(columns) {
  const lookup = new Map();
  for (const column of columns) {
    lookup.set(normalizeKey(column), column);
  }
  return lookup;
}

function findColumn(lookup, aliases) {
  for (const alias of aliases) {
    const found = lookup.get(normalizeKey(alias));
    if (found) return found;
  }
  return null;
}

function getAllColumns(rows) {
  const columnSet = new Set();
  for (const row of rows) {
    Object.keys(row || {}).forEach((key) => columnSet.add(String(key)));
  }
  return [...columnSet];
}

function parseCompanies(rawFile, fileName) {
  let rows;
  try {
    rows = loadRows(fileName, rawFile);
  } catch {
    throw createPublicError("Arquivo invalido ou corrompido.");
  }

  if (!rows.length) {
    throw createPublicError("Arquivo sem dados validos.");
  }

  const columnLookup = buildColumnLookup(getAllColumns(rows));
  const nameCol = findColumn(columnLookup, COMPANY_COLUMN_ALIASES.name);
  const identifierCol = findColumn(columnLookup, COMPANY_COLUMN_ALIASES.identifier);
  const keyCol = findColumn(columnLookup, COMPANY_COLUMN_ALIASES.api_key);
  const systemCol = findColumn(columnLookup, COMPANY_COLUMN_ALIASES.system);

  const missing = [];
  if (!nameCol) missing.push("Nome da empresa");
  if (!identifierCol) missing.push("CNPJ/identifier");
  if (!keyCol) missing.push("API key");
  if (!systemCol) missing.push("Sistema");

  if (missing.length) {
    throw createPublicError(`Colunas obrigatorias ausentes: ${missing.join(", ")}.`);
  }

  const parsedCompanies = [];
  const warnings = [];
  const seen = new Set();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = String(row[nameCol] || "").trim();
    const identifierRaw = normalizeIdentifier(row[identifierCol]);
    const identifierDigits = sanitizeIdentifier(identifierRaw);
    const apiKey = String(row[keyCol] || "").trim();
    const system = normalizeSystem(row[systemCol]);

    if (!name || !identifierRaw || !apiKey || !system) {
      warnings.push(`Linha ${rowNumber}: dados incompletos ou sistema invalido.`);
      return;
    }

    const uniqueKey = `${system}:${identifierDigits || identifierRaw}:${apiKey}`;
    if (seen.has(uniqueKey)) {
      warnings.push(`Linha ${rowNumber}: empresa duplicada ignorada.`);
      return;
    }

    seen.add(uniqueKey);
    parsedCompanies.push({
      id: `${system.toLowerCase()}-${identifierDigits || "semcnpj"}-${parsedCompanies.length + 1}`,
      name,
      identifier: identifierRaw,
      identifier_digits: identifierDigits,
      api_key: apiKey,
      system,
    });
  });

  if (!parsedCompanies.length) {
    throw createPublicError("Nenhuma empresa valida encontrada no arquivo.");
  }

  return { companies: parsedCompanies, warnings };
}

module.exports = {
  COMPANY_COLUMN_ALIASES,
  buildColumnLookup,
  findColumn,
  getAllColumns,
  loadRows,
  parseCompanies,
};
