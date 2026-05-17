function parseDateUtc(value) {
  if (value === null || value === undefined || value === "" || value === "null") {
    return null;
  }

  if (typeof value === "number") {
    let timestamp = value;
    if (timestamp > 10_000_000_000) {
      timestamp = Math.floor(timestamp / 1000);
    }
    const dt = new Date(timestamp * 1000);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    let timestamp = Number(text);
    if (!Number.isNaN(timestamp)) {
      if (timestamp > 10_000_000_000) {
        timestamp = Math.floor(timestamp / 1000);
      }
      const dt = new Date(timestamp * 1000);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
  }

  // Formato ISO sem timezone: assume UTC explicito.
  const naiveIso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (naiveIso) {
    const [, yy, mm, dd, hh, mi, ss, ms = "0"] = naiveIso;
    const dt = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss), Number(ms.padEnd(3, "0").slice(0, 3))));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dmy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (dmy) {
    const [, dd, mm, yy, hh, mi, ss] = dmy;
    const dt = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsed = new Date(text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const brFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatBrazilDatetime(value) {
  const dt = parseDateUtc(value);
  if (!dt) return "-";
  return brFormatter.format(dt).replace(",", "");
}

function formatNowBrt() {
  return brFormatter.format(new Date()).replace(",", "");
}

function isStaleCollection(value, maxAgeMs) {
  const dt = parseDateUtc(value);
  if (!dt) return false;
  return Date.now() - dt.getTime() > maxAgeMs;
}

module.exports = {
  parseDateUtc,
  formatBrazilDatetime,
  formatNowBrt,
  isStaleCollection,
};
