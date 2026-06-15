const path = require("path");
const EventEmitter = require("events");
const fs = require("fs");

const express = require("express");
const multer = require("multer");

const { DB_PATH, initializeDatabase } = require("./src/database/connection");
const { runMigrations } = require("./src/database/migrations");
const companyRepository = require("./src/repositories/companyRepository");
const { parseCompanies } = require("./src/services/companyImport");
const {
  dedupeClocks,
  findClockList,
  normalizeClockItem,
} = require("./src/services/clockNormalization");
const {
  sanitizeIdentifier,
  buildIdentifierCandidates,
} = require("./src/utils/identifier");
const { formatNowBrt } = require("./src/utils/datetime");
const {
  companyToPublic,
  groupCompaniesBySystem,
} = require("./src/utils/company");
const {
  normalizeClockCode,
} = require("./src/utils/clock");
const {
  redactSensitiveText,
  createPublicError,
  getPublicErrorMessage,
  sanitizeErrorForLog,
} = require("./src/utils/errors");
const { createPerformanceLogger } = require("./src/utils/performanceLog");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 8000);
const HOST = "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const SYSTEM_BASE_URLS = {
  DIMEP: "https://www.dimepkairos.com.br",
  MADIS: "https://www.mdcomune.com.br",
};

const CLOCK_SEARCH_ENDPOINT = "/RestServiceApi/Clock/SearchClocks";
const REQUEST_PAYLOAD = { TodosRelogios: true };
const CACHE_TTL_MS = 60 * 1000;
const ENVIRONMENT_ACTIVE_WINDOW_MS = 60 * 60 * 1000;
const AUTO_REFRESH_WINDOW_MS = 90 * 60 * 1000;
const AUTO_REFRESH_CHECK_INTERVAL_MS = 60 * 1000;
const AUTO_REFRESH_RETRY_DELAY_MS = 15 * 60 * 1000;
const STATUS_CONCURRENCY_LIMIT = 3;

// Regra dedicada desta empresa:
// - remove codigos da blocklist
// - exibe somente equipamentos com IP nulo
const SPECIAL_COMPANY_RULES = {
  "11b345c7-6790-4df6-a0fb-7b4bee3a2447": {
    only_null_ip: true,
    blocked_codes: new Set([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "17",
      "19",
      "20",
      "21",
      "22",
      "23",
      "104",
      "105",
      "133",
      "160",
      "161",
      "3500",
      "3501",
      "3502",
      "3504",
      "3505",
      "3506",
      "3507",
      "3508",
      "3509",
      "3510",
      "3511",
      "3512",
      "5000",
      "5001",
      "6000",
      "6001",
      "6002",
      "6003",
      "6004",
      "9998",
      "9999",
    ]),
  },
};

let companies = [];
const statusCache = new Map();
let lastPullStatusRequestAt = null;
let lastManualPullStatusAt = null;
let lastAutoPullStatusAt = null;
let nextAutoPullStatusAt = null;
let lastAutoRefreshErrorAt = null;
let lastAutoRefreshCompletedAt = null;
let autoRefreshRevision = 0;
let isPullStatusRunning = false;
let currentPullStatusPromise = null;
let lastPullStatusPayload = null;
let autoRefreshTimer = null;
let appDataInitPromise = null;
let axiosModule = null;
let xlsxModule = null;

function getAxios() {
  if (!axiosModule) {
    axiosModule = require("axios");
  }
  return axiosModule;
}

function getXlsx() {
  if (!xlsxModule) {
    xlsxModule = require("xlsx");
  }
  return xlsxModule;
}

function startupLog(event, details = {}) {
  const logPath = process.env.PAINEL_STARTUP_LOG_PATH;
  if (!logPath) {
    return;
  }

  try {
    fs.appendFileSync(
      logPath,
      `[startup] ${JSON.stringify({ scope: "backend", event, ...details })}\n`,
      "utf8",
    );
  } catch {
    // Diagnostico de startup nao deve interferir na aplicacao.
  }
}

function getLocalDataDir() {
  if (process.env.PAINEL_MONITORIA_DATA_DIR) {
    return process.env.PAINEL_MONITORIA_DATA_DIR;
  }

  const appDataDir = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), "AppData", "Roaming");
  return path.join(appDataDir, "Monitoring Hub");
}

const pullStatusPerformanceLogger = createPerformanceLogger({
  getDataDir: getLocalDataDir,
  startupLog,
});

function preparePullStatusPerformanceLogFile() {
  pullStatusPerformanceLogger.prepareLogFile();
}

function appendPullStatusPerformanceLog(payload) {
  pullStatusPerformanceLogger.appendLog(payload);
}

function nowMs() {
  return Date.now();
}

function durationSince(startedAt) {
  return Date.now() - startedAt;
}

function createSystemCounters() {
  return { DIMEP: 0, MADIS: 0 };
}

function incrementSystemCounter(counters, system, amount = 1) {
  const key = system || "UNKNOWN";
  counters[key] = (counters[key] || 0) + amount;
  return counters;
}

function maskIdentifierForLog(identifier) {
  const digits = sanitizeIdentifier(identifier);
  if (!digits) {
    return null;
  }

  const visibleDigits = digits.slice(-4);
  return `${"*".repeat(Math.max(0, digits.length - visibleDigits.length))}${visibleDigits}`;
}

function getEnvironmentStatus(referenceTime = Date.now()) {
  const environmentActive = Boolean(
    lastPullStatusRequestAt && referenceTime - lastPullStatusRequestAt.getTime() <= ENVIRONMENT_ACTIVE_WINDOW_MS,
  );

  return {
    environment_status: environmentActive ? "active" : "inactive",
    environment_active: environmentActive,
    last_pull_status_at: lastPullStatusRequestAt ? lastPullStatusRequestAt.toISOString() : null,
    last_manual_pull_status_at: lastManualPullStatusAt ? lastManualPullStatusAt.toISOString() : null,
    last_auto_pull_status_at: lastAutoPullStatusAt ? lastAutoPullStatusAt.toISOString() : null,
    next_auto_pull_status_at: nextAutoPullStatusAt ? nextAutoPullStatusAt.toISOString() : null,
    auto_refresh_enabled: true,
    auto_refresh_running: isPullStatusRunning,
    auto_refresh_revision: autoRefreshRevision,
    last_auto_refresh_completed_at: lastAutoRefreshCompletedAt ? lastAutoRefreshCompletedAt.toISOString() : null,
    environment_inactive_after_minutes: Math.round(ENVIRONMENT_ACTIVE_WINDOW_MS / 60000),
    auto_refresh_after_minutes: Math.round(AUTO_REFRESH_WINDOW_MS / 60000),
  };
}

function scheduleNextAutoRefresh(fromDate = new Date(), delayMs = AUTO_REFRESH_WINDOW_MS) {
  nextAutoPullStatusAt = new Date(fromDate.getTime() + delayMs);
}

function markPullStatusRequest(trigger) {
  const requestedAt = new Date();
  lastPullStatusRequestAt = requestedAt;

  if (trigger === "auto") {
    lastAutoPullStatusAt = requestedAt;
  } else if (trigger === "manual") {
    lastManualPullStatusAt = requestedAt;
  }

  scheduleNextAutoRefresh(requestedAt);
  return requestedAt;
}

function logAutoRefresh(event, details = {}) {
  appendPullStatusPerformanceLog({
    event,
    trigger: "auto",
    ...details,
  });
}

function createCompanyPerformanceMetric(company, index) {
  return {
    index,
    company_ref: `${company.system || "UNKNOWN"}-${index + 1}`,
    system: company.system,
    identifier_masked: maskIdentifierForLog(company.identifier),
    started_at: new Date().toISOString(),
    from_cache: false,
    status: "pending",
    http_status: null,
    http_attempts: 0,
    http_error_code: null,
    external_http_ms: 0,
    normalization_ms: 0,
    cache_update_ms: 0,
    raw_clock_count: 0,
    normalized_clock_count: 0,
    active_clock_count: 0,
    communicating_count: 0,
    not_communicating_count: 0,
    total_ms: 0,
    error_message: null,
  };
}

function createCompanyPerformanceSummary(metric) {
  return {
    company_ref: metric.company_ref,
    system: metric.system,
    identifier_masked: metric.identifier_masked,
    status: metric.status,
    from_cache: metric.from_cache,
    total_ms: metric.total_ms,
    external_http_ms: metric.external_http_ms,
    normalization_ms: metric.normalization_ms,
    cache_update_ms: metric.cache_update_ms,
    http_status: metric.http_status,
    http_error_code: metric.http_error_code,
    active_clock_count: metric.active_clock_count,
    not_communicating_count: metric.not_communicating_count,
  };
}

function createCompanyErrorSummary(metric) {
  return {
    ...createCompanyPerformanceSummary(metric),
    error_message: metric.error_message,
  };
}

app.use(express.json({ limit: "1mb" }));
app.use(
  "/static",
  express.static(PUBLIC_DIR, {
    etag: false,
    maxAge: 0,
    // Evita cache antigo de CSS/JS no navegador local.
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    },
  })
);

function cacheKey(company) {
  return `${company.system}:${company.identifier}:${company.api_key}`;
}

function getCachedStatus(company, forceRefresh) {
  if (forceRefresh) return null;

  const key = cacheKey(company);
  const cached = statusCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    statusCache.delete(key);
    return null;
  }

  const payload = structuredClone(cached.payload);
  payload.from_cache = true;
  return payload;
}

function setCachedStatus(company, payload) {
  const key = cacheKey(company);
  statusCache.set(key, {
    payload: structuredClone(payload),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function applyCompanySpecificFilters(company, clocks) {
  const apiKey = String(company.api_key || "").trim().toLowerCase();
  const rule = SPECIAL_COMPANY_RULES[apiKey];
  if (!rule) return clocks;

  let filtered = clocks.filter((clock) => !rule.blocked_codes.has(normalizeClockCode(clock.code)));
  if (rule.only_null_ip) {
    filtered = filtered.filter((clock) => Boolean(clock.ip_is_null));
  }
  return filtered;
}

function extractHttpErrorMessage(errorResponse, secrets = []) {
  const payload = errorResponse?.data;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    for (const key of ["message", "mensagem", "error", "detail", "erro"]) {
      const value = payload[key];
      if (typeof value === "string" && value.trim()) {
        return redactSensitiveText(value.trim(), secrets).slice(0, 180);
      }
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return redactSensitiveText(payload.trim(), secrets).slice(0, 180);
  }

  return "Sem detalhe retornado pela API.";
}

function buildApiHeaders(baseUrl, identifier, apiKey) {
  return {
    identifier,
    key: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Referer: `${baseUrl}/swagger/ui/index#/`,
    Origin: baseUrl,
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  };
}

async function fetchApiPayload(company, perfMetric = null) {
  const axios = getAxios();
  const baseUrl = SYSTEM_BASE_URLS[company.system];
  const endpoint = `${baseUrl}${CLOCK_SEARCH_ENDPOINT}`;
  const identifiers = buildIdentifierCandidates(company.identifier);

  let lastError = null;

  for (let i = 0; i < identifiers.length; i += 1) {
    const identifier = identifiers[i];
    const httpStartedAt = nowMs();
    let response;

    try {
      response = await axios.post(endpoint, REQUEST_PAYLOAD, {
        headers: buildApiHeaders(baseUrl, identifier, company.api_key),
        timeout: 25000,
        validateStatus: () => true,
      });
    } catch (error) {
      if (perfMetric) {
        perfMetric.http_attempts += 1;
        perfMetric.external_http_ms += durationSince(httpStartedAt);
        perfMetric.http_error_code = error.code || error.name || "REQUEST_ERROR";
      }
      throw error;
    }

    if (perfMetric) {
      perfMetric.http_attempts += 1;
      perfMetric.external_http_ms += durationSince(httpStartedAt);
      perfMetric.http_status = response.status;
    }

    if (response.status === 403 && i < identifiers.length - 1) {
      continue;
    }

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    }

    const err = new Error(`HTTP ${response.status}`);
    err.response = response;
    lastError = err;
    break;
  }

  if (lastError) throw lastError;
  throw new Error("Falha ao autenticar na API.");
}

function buildErrorStatus(company, message) {
  return {
    ...companyToPublic(company),
    status: "error",
    error: redactSensitiveText(message, [company.api_key]),
    from_cache: false,
    active_clock_count: 0,
    communicating_count: 0,
    not_communicating_count: 0,
    clocks: [],
    updated_at: formatNowBrt(),
  };
}

function buildApiFailureStatus(company, error) {
  if (error.response) {
    return buildErrorStatus(
      company,
      `Falha HTTP na API (${error.response.status}): ${extractHttpErrorMessage(error.response, [company.api_key])}`,
    );
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return buildErrorStatus(company, "Tempo limite ao conectar com a API da empresa.");
  }

  if (["ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(error.code)) {
    return buildErrorStatus(company, "Nao foi possivel conectar com a API da empresa.");
  }

  if (error instanceof SyntaxError) {
    return buildErrorStatus(company, "Resposta da API invalida (JSON malformado).");
  }

  return buildErrorStatus(company, "Nao foi possivel conectar com a API da empresa.");
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

async function pullCompanyStatus(company, forceRefresh, perfMetric = null) {
  const companyStartedAt = nowMs();
  const cached = getCachedStatus(company, forceRefresh);
  if (cached) {
    if (perfMetric) {
      perfMetric.from_cache = true;
      perfMetric.status = cached.status || "unknown";
      perfMetric.raw_clock_count = Array.isArray(cached.clocks) ? cached.clocks.length : 0;
      perfMetric.active_clock_count = Number(cached.active_clock_count) || 0;
      perfMetric.communicating_count = Number(cached.communicating_count) || 0;
      perfMetric.not_communicating_count = Number(cached.not_communicating_count) || 0;
      perfMetric.total_ms = durationSince(companyStartedAt);
    }
    return cached;
  }

  try {
    const payload = await fetchApiPayload(company, perfMetric);
    const normalizationStartedAt = nowMs();
    const rawClocks = findClockList(payload) || [];
    const normalizedClocks = rawClocks
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map(normalizeClockItem);

    let activeClocks = normalizedClocks.filter((item) => !item.is_disabled);
    activeClocks = applyCompanySpecificFilters(company, activeClocks);
    activeClocks = dedupeClocks(activeClocks);

    const communicating = activeClocks.filter((item) => item.is_communicating);
    const notCommunicating = activeClocks.filter((item) => !item.is_communicating);

    const status = !activeClocks.length || notCommunicating.length ? "error" : "ok";
    const errorMessage = !activeClocks.length ? "Nenhum relogio ativo encontrado." : null;

    const responsePayload = {
      ...companyToPublic(company),
      status,
      error: errorMessage,
      from_cache: false,
      active_clock_count: activeClocks.length,
      communicating_count: communicating.length,
      not_communicating_count: notCommunicating.length,
      clocks: activeClocks,
      updated_at: formatNowBrt(),
    };

    if (perfMetric) {
      perfMetric.raw_clock_count = rawClocks.length;
      perfMetric.normalized_clock_count = normalizedClocks.length;
      perfMetric.active_clock_count = activeClocks.length;
      perfMetric.communicating_count = communicating.length;
      perfMetric.not_communicating_count = notCommunicating.length;
      perfMetric.status = status;
      perfMetric.error_message = status === "error"
        ? errorMessage || "Empresa com relogios sem comunicacao."
        : null;
      perfMetric.normalization_ms = durationSince(normalizationStartedAt);
    }

    const cacheUpdateStartedAt = nowMs();
    setCachedStatus(company, responsePayload);
    if (perfMetric) {
      perfMetric.cache_update_ms = durationSince(cacheUpdateStartedAt);
      perfMetric.total_ms = durationSince(companyStartedAt);
    }
    return responsePayload;
  } catch (error) {
    if (perfMetric) {
      const sanitizedError = sanitizeErrorForLog(error);
      perfMetric.status = "error";
      perfMetric.http_status = perfMetric.http_status || error?.response?.status || null;
      perfMetric.http_error_code = perfMetric.http_error_code || error?.code || error?.name || null;
      perfMetric.error_message = sanitizedError.message;
      perfMetric.total_ms = durationSince(companyStartedAt);
    }
    return buildApiFailureStatus(company, error);
  }
}

async function initializeAppData() {
  if (appDataInitPromise) {
    return appDataInitPromise;
  }

  appDataInitPromise = (async () => {
    const totalStartedAt = Date.now();
    let startedAt = Date.now();
    await initializeDatabase();
    startupLog("initialize_database_finished", { duration_ms: Date.now() - startedAt });

    startedAt = Date.now();
    await runMigrations();
    startupLog("run_migrations_finished", { duration_ms: Date.now() - startedAt });

    startedAt = Date.now();
    companies = await companyRepository.listCompanies();
    startupLog("companies_loaded", {
      duration_ms: Date.now() - startedAt,
      count: companies.length,
    });
    statusCache.clear();
    preparePullStatusPerformanceLogFile();
    startAutoRefreshTimer();
    startupLog("app_data_initialized", { duration_ms: Date.now() - totalStartedAt });
  })();

  return appDataInitPromise;
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"), (error) => {
    if (error) {
      console.error("Falha ao servir index.html:", sanitizeErrorForLog(error));
      res.status(500).json({ detail: "Erro interno no servidor." });
    }
  });
});

app.get("/api/health", (_req, res) => {
  triggerAutoRefreshIfDue("health").catch((error) => {
    logAutoRefresh("auto_refresh_unexpected_error", { reason: "health", error: sanitizeErrorForLog(error) });
  });

  res.json({
    status: "ok",
    ...getEnvironmentStatus(),
  });
});

app.get("/api/template/companies", (_req, res) => {
  const XLSX = getXlsx();
  const rows = [
    {
      "Nome da empresa": "Empresa Exemplo DIMEP",
      CNPJ: "12.345.678/0001-90",
      "API Key": "sua-chave-api-dimep",
      Sistema: "DIMEP",
    },
    {
      "Nome da empresa": "Empresa Exemplo MADIS",
      CNPJ: "98.765.432/0001-10",
      "API Key": "sua-chave-api-madis",
      Sistema: "MADIS",
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Empresas");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modelo-empresas.xlsx"; filename*=UTF-8\'\'modelo-empresas.xlsx');
  res.send(buffer);
});

app.get("/api/companies", (_req, res) => {
  const publicCompanies = companies.map(companyToPublic);
  res.json({
    total: publicCompanies.length,
    grouped: groupCompaniesBySystem(publicCompanies),
    companies: publicCompanies,
  });
});

app.post("/api/import-companies", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.originalname) {
      return res.status(400).json({ detail: "Arquivo invalido." });
    }

    const extension = path.extname(req.file.originalname || "").toLowerCase();
    if (![".xlsx", ".xls", ".csv"].includes(extension)) {
      return res.status(400).json({ detail: "Formato invalido. Use .xlsx, .xls ou .csv." });
    }

    if (!req.file.buffer?.length) {
      return res.status(400).json({ detail: "Arquivo vazio." });
    }

    const parsed = parseCompanies(req.file.buffer, req.file.originalname);
    await companyRepository.replaceCompanies(parsed.companies);
    companies = parsed.companies;
    statusCache.clear();
    lastPullStatusPayload = null;

    const publicCompanies = companies.map(companyToPublic);
    return res.json({
      total: publicCompanies.length,
      warnings: parsed.warnings,
      grouped: groupCompaniesBySystem(publicCompanies),
      companies: publicCompanies,
    });
  } catch (error) {
    return res.status(400).json({ detail: getPublicErrorMessage(error, "Falha ao importar planilha.") });
  }
});

async function runPullStatus({ forceRefresh = false, trigger = "manual" } = {}) {
  const endpointStartedAt = nowMs();
  const requestId = `${trigger}-${endpointStartedAt}-${Math.random().toString(16).slice(2, 8)}`;
  const companyMetrics = [];
  const preparationStartedAt = endpointStartedAt;

  if (!companies.length) {
    appendPullStatusPerformanceLog({
      request_id: requestId,
      event: "empty_companies",
      trigger,
      total_ms: durationSince(endpointStartedAt),
      request_preparation_ms: durationSince(preparationStartedAt),
      force_refresh: forceRefresh,
    });
    throw createPublicError("Importe um arquivo Excel antes de puxar status.");
  }

  const systemCounts = companies.reduce(
    (acc, company) => {
      incrementSystemCounter(acc, company.system);
      return acc;
    },
    createSystemCounters(),
  );
  const requestPreparationMs = durationSince(preparationStartedAt);

  const companyProcessingStartedAt = nowMs();
  const results = await mapWithConcurrency(companies, STATUS_CONCURRENCY_LIMIT, async (company, index) => {
    const metric = createCompanyPerformanceMetric(company, index);
    companyMetrics.push(metric);
    try {
      return await pullCompanyStatus(company, forceRefresh, metric);
    } catch (error) {
      console.error("Falha inesperada ao consultar empresa:", sanitizeErrorForLog(error, {
        company_ref: metric.company_ref,
        system: company.system,
        identifier_masked: metric.identifier_masked,
      }));
      metric.status = "error";
      metric.error_message = sanitizeErrorForLog(error).message;
      metric.total_ms = metric.total_ms || durationSince(Date.parse(metric.started_at));
      return buildErrorStatus(company, "Erro interno ao consultar status da empresa.");
    }
  });
  const companyProcessingWallMs = durationSince(companyProcessingStartedAt);

  results.sort((a, b) => {
    const systemOrder = a.system.localeCompare(b.system, "pt-BR");
    if (systemOrder !== 0) return systemOrder;
    return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
  });

  const responseAssemblyStartedAt = nowMs();
  const healthyCompanies = results.filter((item) => item.status === "ok").length;
  const unhealthyCompanies = results.filter((item) => item.status === "error").length;
  const fromCacheCompanies = results.filter((item) => item.from_cache).length;
  const responsePayload = {
    total: results.length,
    updated_at: formatNowBrt(),
    summary: {
      healthy_companies: healthyCompanies,
      unhealthy_companies: unhealthyCompanies,
      from_cache: fromCacheCompanies,
    },
    grouped: groupCompaniesBySystem(results),
    companies: results,
  };
  const responseAssemblyMs = durationSince(responseAssemblyStartedAt);

  const responseCacheUpdateStartedAt = nowMs();
  lastPullStatusPayload = structuredClone(responsePayload);
  const responseCacheUpdateMs = durationSince(responseCacheUpdateStartedAt);

  const endpoint_total_ms = durationSince(endpointStartedAt);
  const cachedCompanies = companyMetrics.filter((item) => item.from_cache).length;
  const externalCompanies = companyMetrics.length - cachedCompanies;
  const totalHttpAttempts = companyMetrics.reduce((acc, item) => acc + item.http_attempts, 0);
  const totalExternalHttpMs = companyMetrics.reduce((acc, item) => acc + item.external_http_ms, 0);
  const totalNormalizationMs = companyMetrics.reduce((acc, item) => acc + item.normalization_ms, 0);
  const totalCacheUpdateMs = companyMetrics.reduce((acc, item) => acc + item.cache_update_ms, 0) + responseCacheUpdateMs;
  const totalCompanyMs = companyMetrics.reduce((acc, item) => acc + item.total_ms, 0);
  const totalRawClocks = companyMetrics.reduce((acc, item) => acc + item.raw_clock_count, 0);
  const totalNormalizedClocks = companyMetrics.reduce((acc, item) => acc + item.normalized_clock_count, 0);
  const totalActiveClocks = companyMetrics.reduce((acc, item) => acc + item.active_clock_count, 0);
  const totalNotCommunicatingClocks = companyMetrics.reduce((acc, item) => acc + item.not_communicating_count, 0);
  const aggregateInternalProcessingMs = companyMetrics.reduce(
    (acc, item) => acc + Math.max(0, item.total_ms - item.external_http_ms),
    0,
  );
  const externalHttpBySystemMs = companyMetrics.reduce((acc, item) => {
    incrementSystemCounter(acc, item.system, item.external_http_ms);
    return acc;
  }, createSystemCounters());
  const normalizationBySystemMs = companyMetrics.reduce((acc, item) => {
    incrementSystemCounter(acc, item.system, item.normalization_ms);
    return acc;
  }, createSystemCounters());
  const slowestCompanies = [...companyMetrics]
    .sort((a, b) => b.total_ms - a.total_ms)
    .slice(0, 3)
    .map(createCompanyPerformanceSummary);
  const errorCompanies = companyMetrics
    .filter((item) => item.status === "error")
    .sort((a, b) => b.total_ms - a.total_ms)
    .slice(0, 10)
    .map(createCompanyErrorSummary);

  appendPullStatusPerformanceLog({
    request_id: requestId,
    event: "completed",
    trigger,
    force_refresh: forceRefresh,
    endpoint_total_ms,
    request_preparation_ms: requestPreparationMs,
    company_processing_wall_ms: companyProcessingWallMs,
    companies_total: companies.length,
    companies_processed: results.length,
    systems: systemCounts,
    cached_companies: cachedCompanies,
    external_companies: externalCompanies,
    success_companies: healthyCompanies,
    error_companies: unhealthyCompanies,
    concurrency_limit: STATUS_CONCURRENCY_LIMIT,
    average_company_ms: companyMetrics.length ? Math.round(totalCompanyMs / companyMetrics.length) : 0,
    http_attempts_total: totalHttpAttempts,
    external_http_aggregate_ms: totalExternalHttpMs,
    external_http_by_system_ms: externalHttpBySystemMs,
    normalization_aggregate_ms: totalNormalizationMs,
    normalization_by_system_ms: normalizationBySystemMs,
    response_assembly_ms: responseAssemblyMs,
    cache_update_ms: totalCacheUpdateMs,
    response_cache_update_ms: responseCacheUpdateMs,
    raw_clock_count_total: totalRawClocks,
    normalized_clock_count_total: totalNormalizedClocks,
    active_clock_count_total: totalActiveClocks,
    not_communicating_clock_count_total: totalNotCommunicatingClocks,
    aggregate_internal_processing_ms: aggregateInternalProcessingMs,
    endpoint_non_external_wall_ms: Math.max(0, endpoint_total_ms - Math.max(...companyMetrics.map((item) => item.external_http_ms), 0)),
    slowest_companies: slowestCompanies,
    error_company_samples: errorCompanies,
    error_company_samples_total: unhealthyCompanies,
  });

  return responsePayload;
}

function startPullStatusRun(options) {
  if (currentPullStatusPromise) {
    appendPullStatusPerformanceLog({
      event: "join_running_pull_status",
      trigger: options.trigger || "manual",
    });
    return currentPullStatusPromise;
  }

  isPullStatusRunning = true;
  currentPullStatusPromise = runPullStatus(options)
    .finally(() => {
      isPullStatusRunning = false;
      currentPullStatusPromise = null;
    });

  return currentPullStatusPromise;
}

async function triggerAutoRefreshIfDue(reason = "timer") {
  const referenceTime = Date.now();
  if (!lastPullStatusRequestAt || !nextAutoPullStatusAt || referenceTime < nextAutoPullStatusAt.getTime()) {
    return false;
  }

  if (!companies.length) {
    logAutoRefresh("auto_refresh_skipped_empty_companies", { reason });
    scheduleNextAutoRefresh(new Date(referenceTime), AUTO_REFRESH_RETRY_DELAY_MS);
    return false;
  }

  if (isPullStatusRunning || currentPullStatusPromise) {
    logAutoRefresh("auto_refresh_skipped_running", { reason });
    return false;
  }

  if (lastAutoRefreshErrorAt && referenceTime - lastAutoRefreshErrorAt.getTime() < AUTO_REFRESH_RETRY_DELAY_MS) {
    return false;
  }

  markPullStatusRequest("auto");
  logAutoRefresh("auto_refresh_started", {
    reason,
    companies_total: companies.length,
    next_auto_pull_status_at: nextAutoPullStatusAt ? nextAutoPullStatusAt.toISOString() : null,
  });

  try {
    await startPullStatusRun({ forceRefresh: false, trigger: "auto" });
    lastAutoRefreshErrorAt = null;
    lastAutoRefreshCompletedAt = new Date();
    autoRefreshRevision += 1;
    logAutoRefresh("auto_refresh_completed", {
      revision: autoRefreshRevision,
      completed_at: lastAutoRefreshCompletedAt.toISOString(),
    });
    return true;
  } catch (error) {
    lastAutoRefreshErrorAt = new Date();
    scheduleNextAutoRefresh(lastAutoRefreshErrorAt, AUTO_REFRESH_RETRY_DELAY_MS);
    logAutoRefresh("auto_refresh_failed", {
      error: sanitizeErrorForLog(error),
      retry_after_minutes: Math.round(AUTO_REFRESH_RETRY_DELAY_MS / 60000),
    });
    return false;
  }
}

function startAutoRefreshTimer() {
  if (autoRefreshTimer) {
    return;
  }

  autoRefreshTimer = setInterval(() => {
    triggerAutoRefreshIfDue("timer").catch((error) => {
      logAutoRefresh("auto_refresh_unexpected_error", { error: sanitizeErrorForLog(error) });
    });
  }, AUTO_REFRESH_CHECK_INTERVAL_MS);

  if (typeof autoRefreshTimer.unref === "function") {
    autoRefreshTimer.unref();
  }

  logAutoRefresh("auto_refresh_scheduled", {
    check_interval_ms: AUTO_REFRESH_CHECK_INTERVAL_MS,
    auto_refresh_after_minutes: Math.round(AUTO_REFRESH_WINDOW_MS / 60000),
  });
}

app.post("/api/pull-status", async (req, res) => {
  const source = String(req.body?.source || "manual");
  if (source === "auto_refresh_sync") {
    if (!lastPullStatusPayload) {
      return res.status(409).json({ detail: "Nenhum status automatico disponivel para sincronizacao." });
    }

    return res.json(structuredClone(lastPullStatusPayload));
  }

  const forceRefresh = Boolean(req.body?.force_refresh);
  markPullStatusRequest("manual");

  try {
    const responsePayload = await startPullStatusRun({ forceRefresh, trigger: "manual" });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(JSON.stringify(responsePayload));
  } catch (error) {
    if (error && error.publicMessage) {
      return res.status(400).json({ detail: error.publicMessage });
    }

    console.error("Falha ao puxar status:", sanitizeErrorForLog(error));
    appendPullStatusPerformanceLog({
      event: "failed",
      trigger: "manual",
      error: sanitizeErrorForLog(error),
    });
    return res.status(500).json({ detail: "Erro interno ao consultar status. Tente novamente." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Erro interno no Express:", sanitizeErrorForLog(error));
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ detail: "JSON invalido na requisicao." });
  }
  if (error && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ detail: "Arquivo excede 10MB." });
  }
  return res.status(500).json({ detail: "Erro interno no servidor." });
});

let serverInstance = null;
let serverStartPromise = null;

function startServer(port = PORT) {
  if (serverInstance) {
    return serverInstance;
  }

  const startupEmitter = new EventEmitter();

  serverStartPromise = initializeAppData()
    .then(() => {
      serverInstance = app.listen(port, HOST, () => {
        // Mensagem simples para diagnostico em execucao local, sem expor credenciais.
        console.log(`Servidor Node ativo em http://${HOST}:${port}`);
        console.log(`Banco local SQLite: ${DB_PATH}`);
        startupEmitter.emit("listening");
      });

      serverInstance.on("error", (error) => startupEmitter.emit("error", error));
      serverInstance.on("close", () => startupEmitter.emit("close"));
    })
    .catch((error) => {
      process.nextTick(() => startupEmitter.emit("error", error));
    });

  return startupEmitter;
}

async function startStandaloneServer(port = PORT) {
  await initializeAppData();

  serverInstance = app.listen(port, HOST, () => {
    // Mensagem simples para diagnostico em execucao local, sem expor credenciais.
    console.log(`Servidor Node ativo em http://${HOST}:${port}`);
    console.log(`Banco local SQLite: ${DB_PATH}`);
  });

  return serverInstance;
}

function stopServer() {
  if (!serverInstance) {
    return serverStartPromise ? serverStartPromise.then(() => (serverInstance ? stopServer() : undefined)) : Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    serverInstance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      serverInstance = null;
      serverStartPromise = null;
      resolve();
    });
  });
}

module.exports = {
  app,
  initializeAppData,
  startServer,
  stopServer,
};

if (require.main === module) {
  startStandaloneServer(PORT).catch((error) => {
    console.error("Falha ao iniciar servidor local:", sanitizeErrorForLog(error));
    process.exit(1);
  });
}


