const test = require("node:test");
const assert = require("node:assert/strict");

const XLSX = require("xlsx");

const { parseCompanies } = require("../../src/services/companyImport");
const { companyToPublic } = require("../../src/utils/company");

function createWorkbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Empresas");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("parseCompanies importa DIMEP e MADIS com dados minimos", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa DIMEP",
      CNPJ: "12.345.678/0001-90",
      "API Key": "dimep-secret-key",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa MADIS",
      CNPJ: "98.765.432/0001-10",
      "API Key": "madis-secret-key",
      Sistema: "MADIS",
    },
  ]);

  const parsed = parseCompanies(fileBuffer, "empresas.xlsx");

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.companies.length, 2);
  assert.equal(parsed.companies[0].system, "DIMEP");
  assert.equal(parsed.companies[1].system, "MADIS");
  assert.equal(parsed.companies[0].identifier_digits, "12345678000190");
  assert.equal(parsed.companies[1].identifier_digits, "98765432000110");
  assert.equal(parsed.companies[0].api_key, "dimep-secret-key");

  const publicCompanies = parsed.companies.map(companyToPublic);
  assert.equal(JSON.stringify(publicCompanies).includes("api_key"), false);
  assert.equal(JSON.stringify(publicCompanies).includes("dimep-secret-key"), false);
});

test("parseCompanies aceita aliases de colunas existentes", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      Empresa: "Empresa Alias",
      Identificador: "11.222.333/0001-44",
      Chave: "alias-secret-key",
      Plataforma: "madis",
    },
  ]);

  const parsed = parseCompanies(fileBuffer, "aliases.xlsx");

  assert.equal(parsed.companies.length, 1);
  assert.equal(parsed.companies[0].name, "Empresa Alias");
  assert.equal(parsed.companies[0].system, "MADIS");
  assert.equal(parsed.companies[0].identifier_digits, "11222333000144");
});

test("parseCompanies retorna erro para colunas obrigatorias ausentes", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa Sem Chave",
      CNPJ: "12.345.678/0001-90",
      Sistema: "DIMEP",
    },
  ]);

  assert.throws(
    () => parseCompanies(fileBuffer, "sem-chave.xlsx"),
    (error) => error.publicMessage === "Colunas obrigatorias ausentes: API key.",
  );
});

test("parseCompanies mantem linhas validas e avisa linhas incompletas ou sistema invalido", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa Valida",
      CNPJ: "12.345.678/0001-90",
      "API Key": "valid-secret-key",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa Sem Key",
      CNPJ: "22.222.222/0001-22",
      "API Key": "",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa Sistema Ruim",
      CNPJ: "33.333.333/0001-33",
      "API Key": "invalid-system-key",
      Sistema: "OUTRO",
    },
  ]);

  const parsed = parseCompanies(fileBuffer, "warnings.xlsx");

  assert.equal(parsed.companies.length, 1);
  assert.deepEqual(parsed.warnings, [
    "Linha 3: dados incompletos ou sistema invalido.",
    "Linha 4: dados incompletos ou sistema invalido.",
  ]);
});

test("parseCompanies ignora duplicidade preservando aviso existente", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa Original",
      CNPJ: "12.345.678/0001-90",
      "API Key": "duplicate-secret-key",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa Duplicada",
      CNPJ: "12345678000190",
      "API Key": "duplicate-secret-key",
      Sistema: "DIMEP",
    },
  ]);

  const parsed = parseCompanies(fileBuffer, "duplicada.xlsx");

  assert.equal(parsed.companies.length, 1);
  assert.deepEqual(parsed.warnings, ["Linha 3: empresa duplicada ignorada."]);
});

test("parseCompanies retorna erro quando nenhuma linha valida resta", () => {
  const fileBuffer = createWorkbookBuffer([
    {
      "Nome da empresa": "Empresa Invalida",
      CNPJ: "12.345.678/0001-90",
      "API Key": "invalid-secret-key",
      Sistema: "OUTRO",
    },
  ]);

  assert.throws(
    () => parseCompanies(fileBuffer, "invalida.xlsx"),
    (error) => error.publicMessage === "Nenhuma empresa valida encontrada no arquivo.",
  );
});
