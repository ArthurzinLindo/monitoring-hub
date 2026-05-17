const { normalizeKey } = require("./text");

function isNullIp(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  return ["null", "none"].includes(normalizeKey(text));
}

function normalizeClockCode(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\d+/);
  if (match) return match[0];
  return normalizeKey(text);
}

function normalizeClockIdentityValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") return "";
  return normalizeKey(text);
}

function buildClockIdentityKey(clock) {
  const fabricationNumber = normalizeClockIdentityValue(clock.fabrication_number);
  const code = normalizeClockCode(clock.code);
  const ip = normalizeClockIdentityValue(clock.ip);
  const name = normalizeClockIdentityValue(clock.name);

  if (fabricationNumber) return `fabrication:${fabricationNumber}`;
  if (code && ip) return `code-ip:${code}:${ip}`;
  if (code && name) return `code-name:${code}:${name}`;
  if (code) return `code:${code}`;
  if (ip && name) return `ip-name:${ip}:${name}`;
  return `raw:${JSON.stringify(clock)}`;
}

module.exports = {
  isNullIp,
  normalizeClockCode,
  normalizeClockIdentityValue,
  buildClockIdentityKey,
};
