function sanitizeIdentifier(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeIdentifier(value) {
  return String(value || "").trim();
}

function formatCnpjFromDigits(digits) {
  if (digits.length !== 14) {
    return digits;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function buildIdentifierCandidates(identifier) {
  const raw = normalizeIdentifier(identifier);
  const digits = sanitizeIdentifier(raw);
  const formatted = formatCnpjFromDigits(digits);

  const candidates = [];
  for (const value of [raw, digits, formatted]) {
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  }
  return candidates;
}

module.exports = {
  sanitizeIdentifier,
  normalizeIdentifier,
  formatCnpjFromDigits,
  buildIdentifierCandidates,
};
