const { normalizeKey } = require("./text");

function normalizeSystem(value) {
  const text = normalizeKey(value || "");
  if (text.includes("dimep")) return "DIMEP";
  if (text.includes("madis") || text.includes("mdcomune")) return "MADIS";
  return null;
}

function companyToPublic(company) {
  return {
    id: company.id,
    name: company.name,
    identifier: company.identifier,
    system: company.system,
  };
}

function groupCompaniesBySystem(list) {
  return {
    DIMEP: list.filter((item) => item.system === "DIMEP"),
    MADIS: list.filter((item) => item.system === "MADIS"),
  };
}

function maskApiKey(value) {
  const text = String(value || "").trim();
  if (text.length <= 8) {
    return text ? "********" : "";
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

module.exports = {
  normalizeSystem,
  companyToPublic,
  groupCompaniesBySystem,
  maskApiKey,
};
