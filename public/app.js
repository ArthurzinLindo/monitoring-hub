const state = {
  companies: [],
  statusesById: new Map(),
  selectedCompanyId: null,
  modalFilter: "all",
  modalLayout: "normal",
  selectedSystem: "DIMEP",
  companySearchTerm: "",
  companyStatusFilter: "all",
  isAlphabeticalSortActive: false,
  companyAutoSwitchMessage: "",
  systemBeforeSearchAutoSwitch: null,
  wasAutoSwitchedBySearch: false,
  isPullingStatus: false,
  isModalLayoutAnimating: false,
  isAutoRefreshSyncing: false,
  lastSeenAutoRefreshRevision: 0,
  desktopPreferences: {
    startWithWindows: false,
    minimizeToTray: false,
  },
};

const MODAL_LAYOUT_STORAGE_KEY = "painel_clock_layout";
const MODAL_LAYOUT_LEAVE_MS = 130;
const MODAL_LAYOUT_ENTER_MS = 170;

function nowMs() {
  return performance.now();
}

function roundMs(value) {
  return Math.round(value);
}

function logPullStatusFrontendPerformance(payload) {
  // Log seguro para diagnostico local. Nao contem api_key, headers nem payload externo.
  console.info("[pull-status/frontend]", JSON.stringify(payload));
}

const elements = {
  environmentStatusPill: document.getElementById("environmentStatusPill"),
  environmentStatusText: document.getElementById("environmentStatusText"),
  currentTime: document.getElementById("currentTime"),
  excelInput: document.getElementById("excelInput"),
  importButton: document.getElementById("importButton"),
  pullStatusButton: document.getElementById("pullStatusButton"),
  feedback: document.getElementById("feedback"),
  totalCompanies: document.getElementById("totalCompanies"),
  dimepCompanies: document.getElementById("dimepCompanies"),
  madisCompanies: document.getElementById("madisCompanies"),
  communicatingClocks: document.getElementById("communicatingClocks"),
  offlineClocks: document.getElementById("offlineClocks"),
  errorCompanies: document.getElementById("errorCompanies"),
  cacheLabel: document.getElementById("cacheLabel"),
  lastUpdateLabel: document.getElementById("lastUpdateLabel"),
  tabDimep: document.getElementById("tabDimep"),
  tabMadis: document.getElementById("tabMadis"),
  selectedSystemKicker: document.getElementById("selectedSystemKicker"),
  monitoredCount: document.getElementById("monitoredCount"),
  companySearchInput: document.getElementById("companySearchInput"),
  companyFilterButtons: Array.from(document.querySelectorAll(".company-filter-button")),
  companySortAlphabetical: document.getElementById("companySortAlphabetical"),
  companyList: document.getElementById("companyList"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingText: document.getElementById("loadingText"),
  companyModal: document.getElementById("companyModal"),
  closeModalButton: document.getElementById("closeModalButton"),
  modalTitle: document.getElementById("modalTitle"),
  modalSubtitle: document.getElementById("modalSubtitle"),
  modalCardsWrapper: document.querySelector(".modal-cards-wrapper"),
  modalCardsGrid: document.getElementById("modalCardsGrid"),
  showAllBtn: document.getElementById("showAllBtn"),
  showOnlineBtn: document.getElementById("showOnlineBtn"),
  showOfflineBtn: document.getElementById("showOfflineBtn"),
  modalFilters: document.querySelector(".modal-filters"),
  modalLayoutToggle: null,
  modalExportWrapper: null,
  modalExportButton: null,
  modalExportMenu: null,
  modalExportFeedback: null,
  desktopSettingsPanel: document.getElementById("desktopSettingsPanel"),
  startWithWindowsToggle: document.getElementById("startWithWindowsToggle"),
  minimizeToTrayToggle: document.getElementById("minimizeToTrayToggle"),
  desktopSettingsFeedback: document.getElementById("desktopSettingsFeedback"),
};

function setEnvironmentStatus(isActive) {
  if (!elements.environmentStatusPill || !elements.environmentStatusText) {
    return;
  }

  elements.environmentStatusPill.classList.toggle("status-pill-active", isActive);
  elements.environmentStatusPill.classList.toggle("status-pill-inactive", !isActive);
  elements.environmentStatusText.textContent = isActive ? "Ambiente local ativo" : "Ambiente local inativo";
}

async function refreshEnvironmentStatus() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload));
    }

    setEnvironmentStatus(Boolean(payload.environment_active));
    syncStatusAfterAutoRefresh(payload);
  } catch {
    setEnvironmentStatus(false);
  }
}

async function syncStatusAfterAutoRefresh(healthPayload) {
  const revision = Number(healthPayload?.auto_refresh_revision) || 0;
  if (
    !revision ||
    revision <= state.lastSeenAutoRefreshRevision ||
    healthPayload?.auto_refresh_running ||
    state.isPullingStatus ||
    state.isAutoRefreshSyncing
  ) {
    return;
  }

  state.isAutoRefreshSyncing = true;
  try {
    const response = await fetch("/api/pull-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "auto_refresh_sync" }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return;
    }

    syncStatuses(payload.companies || []);
    setOperationalSummary(payload.companies || [], payload.summary || {});
    elements.lastUpdateLabel.textContent = payload.updated_at || "-";
    renderDashboard();
    state.lastSeenAutoRefreshRevision = revision;
    setFeedback("Status atualizado automaticamente.", "success");
  } catch {
    // Sincronizacao visual do auto-refresh e opcional; falha aqui nao deve interromper o painel.
  } finally {
    state.isAutoRefreshSyncing = false;
  }
}

function setFeedback(message, type = "") {
  elements.feedback.textContent = message || "";
  elements.feedback.className = "feedback";
  if (type) {
    elements.feedback.classList.add(type);
  }
}

function setLoading(isLoading, message = "Consultando APIs...") {
  elements.loadingText.textContent = message;
  elements.loadingOverlay.classList.toggle("hidden", !isLoading);
  elements.loadingOverlay.setAttribute("aria-hidden", String(!isLoading));
}

function updateButtonsState() {
  const hasCompanies = state.companies.length > 0;
  elements.pullStatusButton.disabled = !hasCompanies || state.isPullingStatus;
}

function hasDesktopBridge() {
  return Boolean(window.electronAPI?.getPreferences && window.electronAPI?.setPreferences);
}

function setSettingsFeedback(message, type = "") {
  if (!elements.desktopSettingsFeedback) {
    return;
  }

  elements.desktopSettingsFeedback.textContent = message || "";
  elements.desktopSettingsFeedback.className = "settings-feedback";
  if (type) {
    elements.desktopSettingsFeedback.classList.add(type);
  }
}

function renderDesktopPreferences() {
  elements.desktopSettingsPanel?.classList.toggle("hidden", !hasDesktopBridge());

  const { startWithWindows, minimizeToTray } = state.desktopPreferences;
  elements.startWithWindowsToggle?.classList.toggle("active", Boolean(startWithWindows));
  elements.startWithWindowsToggle?.setAttribute("aria-pressed", String(Boolean(startWithWindows)));
  elements.minimizeToTrayToggle?.classList.toggle("active", Boolean(minimizeToTray));
  elements.minimizeToTrayToggle?.setAttribute("aria-pressed", String(Boolean(minimizeToTray)));
}

async function loadDesktopPreferences() {
  if (!hasDesktopBridge()) {
    renderDesktopPreferences();
    return;
  }

  try {
    state.desktopPreferences = await window.electronAPI.getPreferences();
    renderDesktopPreferences();
  } catch {
    setSettingsFeedback("Nao foi possivel carregar as configuracoes do aplicativo.", "error");
  }
}

async function updateDesktopPreference(key, value) {
  if (!hasDesktopBridge()) {
    return;
  }

  try {
    setSettingsFeedback("Salvando configuracao...");
    state.desktopPreferences = await window.electronAPI.setPreferences({ [key]: value });
    renderDesktopPreferences();
    setSettingsFeedback("Configuracao atualizada.", "success");
  } catch {
    setSettingsFeedback("Nao foi possivel atualizar a configuracao.", "error");
    await loadDesktopPreferences();
  }
}

function getStatus(companyId) {
  return state.statusesById.get(companyId) || null;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getCompanyStatusGroup(company) {
  const status = getStatus(company.id);
  if (!status) {
    return "pending";
  }
  if (status.status === "error") {
    return "error";
  }
  if ((Number(status.not_communicating_count) || 0) > 0) {
    return "offline";
  }
  return "ok";
}

function getCompanySortPriority(company) {
  const group = getCompanyStatusGroup(company);
  const priorities = {
    error: 0,
    offline: 1,
    pending: 2,
    ok: 3,
  };
  return priorities[group] ?? 4;
}

function companyMatchesSearch(company, term) {
  if (!term) {
    return true;
  }

  const normalizedTerm = normalizeSearchText(term);
  const termDigits = onlyDigits(term);
  const normalizedName = normalizeSearchText(company.name);
  const normalizedIdentifier = normalizeSearchText(company.identifier);
  const identifierDigits = onlyDigits(company.identifier);

  return (
    normalizedName.includes(normalizedTerm) ||
    normalizedIdentifier.includes(normalizedTerm) ||
    Boolean(termDigits && identifierDigits.includes(termDigits))
  );
}

function companyMatchesStatusFilter(company) {
  if (state.companyStatusFilter === "all") {
    return true;
  }

  const status = getStatus(company.id);
  if (state.companyStatusFilter === "offline") {
    return Boolean(status && (Number(status.not_communicating_count) || 0) > 0);
  }
  if (state.companyStatusFilter === "ok") {
    return Boolean(status && status.status === "ok" && (Number(status.not_communicating_count) || 0) === 0);
  }
  return true;
}

function getOtherSystem(system) {
  return system === "DIMEP" ? "MADIS" : "DIMEP";
}

function hasCompanySearchTerm() {
  return Boolean(normalizeSearchText(state.companySearchTerm) || onlyDigits(state.companySearchTerm));
}

function getVisibleCompaniesForSystem(system) {
  return state.companies
    .filter((item) => item.system === system)
    .filter((item) => companyMatchesSearch(item, state.companySearchTerm))
    .filter(companyMatchesStatusFilter)
    .sort((a, b) => {
      if (state.isAlphabeticalSortActive) {
        return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
      }

      const priorityDiff = getCompanySortPriority(a) - getCompanySortPriority(b);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
}

function getVisibleCompaniesInSelectedSystem() {
  return getVisibleCompaniesForSystem(state.selectedSystem);
}

function clearSearchAutoSwitchState() {
  state.companyAutoSwitchMessage = "";
  state.systemBeforeSearchAutoSwitch = null;
  state.wasAutoSwitchedBySearch = false;
}

function restoreSystemAfterSearchClear() {
  if (state.wasAutoSwitchedBySearch && state.systemBeforeSearchAutoSwitch) {
    state.selectedSystem = state.systemBeforeSearchAutoSwitch;
  }
  clearSearchAutoSwitchState();
}

function applyAutomaticSystemSwitch() {
  state.companyAutoSwitchMessage = "";

  if (!hasCompanySearchTerm()) {
    return;
  }

  const currentSystem = state.selectedSystem;
  const currentMatches = getVisibleCompaniesForSystem(currentSystem);
  if (currentMatches.length > 0) {
    return;
  }

  const otherSystem = getOtherSystem(currentSystem);
  const otherMatches = getVisibleCompaniesForSystem(otherSystem);
  if (!otherMatches.length) {
    if (!state.wasAutoSwitchedBySearch) {
      state.systemBeforeSearchAutoSwitch = null;
    }
    return;
  }

  if (!state.wasAutoSwitchedBySearch) {
    state.systemBeforeSearchAutoSwitch = currentSystem;
  }

  state.selectedSystem = otherSystem;
  state.wasAutoSwitchedBySearch = true;
  state.companyAutoSwitchMessage = `Nenhum resultado encontrado em ${currentSystem}. porém encontrado na ${otherSystem}.`;
}

function createEmptyState(message) {
  const wrapper = document.createElement("p");
  wrapper.className = "feedback";
  wrapper.textContent = message;
  return wrapper;
}

function getStoredModalLayout() {
  try {
    return localStorage.getItem(MODAL_LAYOUT_STORAGE_KEY) === "compact" ? "compact" : "normal";
  } catch {
    return "normal";
  }
}

function saveModalLayout(layout) {
  try {
    localStorage.setItem(MODAL_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // LocalStorage pode estar indisponivel; o estado em memoria continua funcionando.
  }
}

function getModalLayoutIcon() {
  if (state.modalLayout === "compact") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="4" height="4" rx="1"></rect>
        <rect x="10" y="5" width="4" height="4" rx="1"></rect>
        <rect x="16" y="5" width="4" height="4" rx="1"></rect>
        <rect x="4" y="11" width="4" height="4" rx="1"></rect>
        <rect x="10" y="11" width="4" height="4" rx="1"></rect>
        <rect x="16" y="11" width="4" height="4" rx="1"></rect>
        <rect x="4" y="17" width="4" height="2" rx="1"></rect>
        <rect x="10" y="17" width="4" height="2" rx="1"></rect>
        <rect x="16" y="17" width="4" height="2" rx="1"></rect>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="5" height="5" rx="1.4"></rect>
      <rect x="14" y="5" width="5" height="5" rx="1.4"></rect>
      <rect x="5" y="14" width="5" height="5" rx="1.4"></rect>
      <rect x="14" y="14" width="5" height="5" rx="1.4"></rect>
    </svg>
  `;
}

function updateModalLayoutToggle() {
  const isCompact = state.modalLayout === "compact";
  elements.modalCardsGrid.classList.toggle("is-compact", isCompact);

  if (!elements.modalLayoutToggle) {
    return;
  }

  elements.modalLayoutToggle.innerHTML = getModalLayoutIcon();
  elements.modalLayoutToggle.classList.toggle("is-compact", isCompact);
  elements.modalLayoutToggle.setAttribute(
    "aria-label",
    isCompact ? "Layout compacto ativo. Alternar para layout normal." : "Layout normal ativo. Alternar para layout compacto.",
  );
}

function shouldAnimateModalLayoutChange() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clearModalLayoutAnimationClasses() {
  elements.modalCardsWrapper?.classList.remove("is-layout-leaving", "is-layout-entering");
  elements.modalLayoutToggle?.classList.remove("is-layout-switching");
}

function waitForModalLayoutFrame(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function toggleModalLayout() {
  if (state.isModalLayoutAnimating) {
    return;
  }

  const nextLayout = state.modalLayout === "compact" ? "normal" : "compact";
  const shouldAnimate = shouldAnimateModalLayoutChange() && elements.modalCardsWrapper && elements.modalCardsGrid;

  if (!shouldAnimate) {
    state.modalLayout = nextLayout;
    saveModalLayout(state.modalLayout);
    updateModalLayoutToggle();
    renderModalCards();
    return;
  }

  state.isModalLayoutAnimating = true;
  elements.modalLayoutToggle?.setAttribute("disabled", "true");
  clearModalLayoutAnimationClasses();

  try {
    elements.modalLayoutToggle?.classList.add("is-layout-switching");
    elements.modalCardsWrapper.classList.add("is-layout-leaving");
    await waitForModalLayoutFrame(MODAL_LAYOUT_LEAVE_MS);

    state.modalLayout = nextLayout;
    saveModalLayout(state.modalLayout);
    renderModalCards();

    elements.modalCardsWrapper.classList.remove("is-layout-leaving");
    elements.modalCardsWrapper.classList.add("is-layout-entering");
    await waitForModalLayoutFrame(MODAL_LAYOUT_ENTER_MS);
  } finally {
    clearModalLayoutAnimationClasses();
    elements.modalLayoutToggle?.removeAttribute("disabled");
    state.isModalLayoutAnimating = false;
  }
}

function setupModalLayoutToggle() {
  if (!elements.modalFilters || elements.modalLayoutToggle) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-ghost modal-layout-toggle active";
  button.title = "Alternar layout";
  button.addEventListener("click", toggleModalLayout);

  elements.modalLayoutToggle = button;
  elements.modalFilters.appendChild(button);
  updateModalLayoutToggle();
}

function getModalFilterLabel(filter = state.modalFilter) {
  const labels = {
    all: "Todos",
    online: "Comunicando",
    offline: "Sem comunicacao",
  };
  return labels[filter] || labels.all;
}

function hasClockImageExportBridge() {
  return Boolean(window.electronAPI?.exportClockImage);
}

function setModalExportFeedback(message, type = "") {
  if (!elements.modalExportFeedback) {
    return;
  }

  elements.modalExportFeedback.textContent = message || "";
  elements.modalExportFeedback.className = "modal-export-feedback";
  if (type) {
    elements.modalExportFeedback.classList.add(type);
  }
  elements.modalExportFeedback.classList.toggle("hidden", !message);
}

function setModalExportMenuOpen(isOpen) {
  if (!elements.modalExportButton || !elements.modalExportMenu) {
    return;
  }

  elements.modalExportButton.setAttribute("aria-expanded", String(Boolean(isOpen)));
  elements.modalExportMenu.classList.toggle("hidden", !isOpen);
}

function closeModalExportMenu() {
  setModalExportMenuOpen(false);
}

function toggleModalExportMenu() {
  const isHidden = elements.modalExportMenu?.classList.contains("hidden") ?? true;
  setModalExportMenuOpen(isHidden);
}

function buildClockImagePayload(layout) {
  const company = state.companies.find((item) => item.id === state.selectedCompanyId);
  const status = getStatus(state.selectedCompanyId);
  if (!company || !status) {
    return null;
  }

  return {
    softwareName: "Clock Monitoring Hub",
    layout,
    filter: {
      value: state.modalFilter,
      label: getModalFilterLabel(),
    },
    generatedAt: new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour12: false,
    }),
    company: {
      name: company.name,
      identifier: company.identifier,
      activeClockCount: status.active_clock_count ?? 0,
      updatedAt: status.updated_at || "-",
    },
    clocks: getModalRows().map((clock) => ({
      name: String(clock.name || "-"),
      code: String(clock.code ?? "-"),
      fabricationNumber: getClockFabricationNumber(clock),
      ip: String(clock.ip ?? "-"),
      lastCollectionBrt: String(clock.last_collection_brt || "-"),
      isCommunicating: Boolean(clock.is_communicating),
      statusLabel: clock.is_communicating ? "OK" : "Falha",
    })),
  };
}

async function exportClockImage(layout) {
  closeModalExportMenu();

  if (!hasClockImageExportBridge()) {
    setModalExportFeedback("Exportacao disponivel apenas no aplicativo desktop.", "error");
    return;
  }

  const payload = buildClockImagePayload(layout);
  if (!payload) {
    setModalExportFeedback("Abra uma empresa com status consultado para exportar.", "error");
    return;
  }

  try {
    setModalExportFeedback("Gerando imagem...");
    const result = await window.electronAPI.exportClockImage(payload);
    if (!result?.ok) {
      throw new Error(result?.error || "Falha ao gerar imagem.");
    }
    setModalExportFeedback("Imagem salva em Downloads.", "success");
  } catch {
    setModalExportFeedback("Nao foi possivel gerar a imagem.", "error");
  }
}

function createModalExportOption(label, layout) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.addEventListener("click", () => exportClockImage(layout));
  return button;
}

function createDownloadIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  arrowPath.setAttribute("d", "M12 4v9.2m0 0 3.4-3.4M12 13.2 8.6 9.8");

  const trayPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  trayPath.setAttribute("d", "M5 15.8v2.4c0 .9.7 1.6 1.6 1.6h10.8c.9 0 1.6-.7 1.6-1.6v-2.4");

  svg.append(arrowPath, trayPath);
  return svg;
}

function setupModalExportControls() {
  if (!elements.modalFilters || elements.modalExportButton) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "modal-export-wrapper";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-ghost modal-export-toggle";
  button.title = "Exportar lista de relogios como imagem";
  button.setAttribute("aria-label", "Exportar imagem dos relogios");
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.appendChild(createDownloadIcon());
  button.addEventListener("click", toggleModalExportMenu);

  const menu = document.createElement("div");
  menu.className = "modal-export-menu hidden";
  menu.setAttribute("role", "menu");
  menu.append(
    createModalExportOption("Exportar imagem — Pequeno", "compact"),
    createModalExportOption("Exportar imagem — Grande", "normal"),
  );

  wrapper.append(button, menu);

  const feedback = document.createElement("p");
  feedback.className = "modal-export-feedback hidden";

  elements.modalExportWrapper = wrapper;
  elements.modalExportButton = button;
  elements.modalExportMenu = menu;
  elements.modalExportFeedback = feedback;
  elements.modalFilters.append(wrapper, feedback);
}

function createCompanyCard(company) {
  const status = getStatus(company.id);
  const statusClass = status ? status.status : "";

  const card = document.createElement("article");
  card.className = `company-card ${statusClass}`.trim();
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const healthy = status?.communicating_count ?? 0;
  const unhealthy = status?.not_communicating_count ?? 0;
  const activeCount = status?.active_clock_count ?? 0;
  const hasStatus = Boolean(status);
  const indicatorClass = status?.status === "ok" ? "ok" : "error";

  let statusText = "Aguardando consulta";
  if (hasStatus) {
    statusText = status.error
      ? `Erro: ${status.error}`
      : `${healthy} comunicando | ${unhealthy} sem comunicacao`;
  }

  const title = document.createElement("h3");
  title.textContent = company.name;

  const identifier = document.createElement("p");
  identifier.textContent = `CNPJ: ${company.identifier}`;

  const meta = document.createElement("div");
  meta.className = "company-meta";

  const statusInfo = document.createElement("span");
  if (hasStatus) {
    const statusDot = document.createElement("span");
    statusDot.className = `status-dot ${indicatorClass}`;
    statusInfo.append(statusDot, status.status === "ok" ? "Todos comunicando" : "Falha detectada");
  } else {
    statusInfo.textContent = "Sem status";
  }

  const activeInfo = document.createElement("span");
  activeInfo.textContent = `Ativos: ${activeCount}`;
  meta.append(statusInfo, activeInfo);

  const statusDescription = document.createElement("p");
  statusDescription.textContent = statusText;

  card.append(title, identifier, meta, statusDescription);

  const openDetails = () => {
    if (!hasStatus) {
      setFeedback("Puxe o status antes de abrir os detalhes da empresa.", "warning");
      return;
    }
    openModal(company.id);
  };

  card.addEventListener("click", openDetails);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails();
    }
  });

  return card;
}

function updateSummaryCards() {
  const dimepCount = state.companies.filter((item) => item.system === "DIMEP").length;
  const madisCount = state.companies.filter((item) => item.system === "MADIS").length;

  elements.totalCompanies.textContent = String(state.companies.length);
  elements.dimepCompanies.textContent = String(dimepCount);
  elements.madisCompanies.textContent = String(madisCount);
}

function updateSystemsTabs() {
  const isDimep = state.selectedSystem === "DIMEP";
  elements.tabDimep.classList.toggle("active", isDimep);
  elements.tabMadis.classList.toggle("active", !isDimep);
  elements.selectedSystemKicker.textContent = `Sistema ${state.selectedSystem}`;
}

function updateCompanyFilterButtons() {
  elements.companyFilterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.companyStatusFilter);
  });

  elements.companySortAlphabetical?.classList.toggle("active", state.isAlphabeticalSortActive);
  elements.companySortAlphabetical?.setAttribute("aria-pressed", String(state.isAlphabeticalSortActive));
}

function renderCompanyList() {
  const companiesInSystem = state.companies.filter((item) => item.system === state.selectedSystem);
  const visibleCompanies = getVisibleCompaniesInSelectedSystem();

  elements.companyList.innerHTML = "";
  elements.monitoredCount.textContent =
    visibleCompanies.length === companiesInSystem.length
      ? `${companiesInSystem.length} empresa(s)`
      : `${visibleCompanies.length} de ${companiesInSystem.length} empresa(s)`;

  if (state.companyAutoSwitchMessage) {
    elements.companyList.appendChild(createAutoSwitchMessage(state.companyAutoSwitchMessage));
  }

  if (!companiesInSystem.length) {
    elements.companyList.appendChild(createEmptyState(`Nenhuma empresa ${state.selectedSystem} importada.`));
    return;
  }

  if (!visibleCompanies.length) {
    elements.companyList.appendChild(createEmptyState("Nenhuma empresa encontrada para os filtros atuais."));
    return;
  }

  visibleCompanies.forEach((company) => {
    elements.companyList.appendChild(createCompanyCard(company));
  });
}

function createAutoSwitchMessage(message) {
  const wrapper = document.createElement("p");
  wrapper.className = "company-auto-switch-message";
  wrapper.textContent = message;
  return wrapper;
}

function renderDashboard() {
  updateSummaryCards();
  updateSystemsTabs();
  updateCompanyFilterButtons();
  renderCompanyList();
}

function setOperationalSummary(companies = [], summary = {}) {
  const communicatingClocks = companies.reduce(
    (acc, item) => acc + (Number(item.communicating_count) || 0),
    0,
  );
  const offlineClocks = companies.reduce(
    (acc, item) => acc + (Number(item.not_communicating_count) || 0),
    0,
  );
  const errorCompanies = companies.filter((item) => item.status === "error").length;

  elements.communicatingClocks.textContent = String(communicatingClocks);
  elements.offlineClocks.textContent = String(offlineClocks);
  elements.errorCompanies.textContent = String(errorCompanies);
  elements.cacheLabel.textContent = `Cache ativo: ${summary.from_cache || 0}`;
}

function parseErrorMessage(payload) {
  if (!payload) return "Erro inesperado.";
  if (typeof payload.detail === "string") return payload.detail;
  return "Nao foi possivel completar a operacao.";
}

async function importCompanies() {
  const file = elements.excelInput.files?.[0];
  if (!file) {
    setFeedback("Selecione um arquivo Excel antes de importar.", "warning");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  setLoading(true, "Importando empresas...");
  setFeedback("Importando empresas...", "");

  try {
    const response = await fetch("/api/import-companies", {
      method: "POST",
      body: formData,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload));
    }

    state.companies = payload.companies || [];
    state.statusesById.clear();

    setOperationalSummary([], { from_cache: 0 });
    elements.lastUpdateLabel.textContent = "-";
    renderDashboard();
    updateButtonsState();

    const warningCount = payload.warnings?.length || 0;
    const warningSuffix = warningCount ? ` (${warningCount} aviso(s) na planilha)` : "";
    setFeedback(
      `Importacao concluida com ${payload.total} empresa(s).${warningSuffix}`,
      warningCount ? "warning" : "success",
    );
  } catch (error) {
    setFeedback(error.message || "Falha ao importar planilha.", "error");
  } finally {
    setLoading(false);
  }
}

function syncStatuses(companies = []) {
  state.statusesById.clear();
  companies.forEach((item) => {
    state.statusesById.set(item.id, item);
  });
}

async function pullStatus(forceRefresh = false, clickStartedAt = nowMs()) {
  const flowStartedAt = clickStartedAt;
  const functionStartedAt = nowMs();
  let requestStartedAt = null;
  let responseReceivedAt = null;
  let jsonParsedAt = null;
  let stateUpdatedAt = null;
  let renderFinishedAt = null;
  let payloadCompanyCount = 0;
  let payloadCacheCount = 0;

  if (!state.companies.length) {
    setFeedback("Importe uma planilha antes de puxar o status.", "warning");
    return;
  }

  if (state.isPullingStatus) {
    return;
  }

  state.isPullingStatus = true;
  updateButtonsState();
  setLoading(true, "Consultando API");
  setFeedback("Puxando status...", "");
  setEnvironmentStatus(true);

  try {
    requestStartedAt = nowMs();
    const response = await fetch("/api/pull-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force_refresh: forceRefresh }),
    });
    responseReceivedAt = nowMs();

    const jsonStartedAt = nowMs();
    const payload = await response.json();
    jsonParsedAt = nowMs();
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload));
    }

    const stateStartedAt = nowMs();
    syncStatuses(payload.companies || []);
    setOperationalSummary(payload.companies || [], payload.summary || {});
    elements.lastUpdateLabel.textContent = payload.updated_at || "-";
    stateUpdatedAt = nowMs();

    const renderStartedAt = nowMs();
    renderDashboard();
    renderFinishedAt = nowMs();
    payloadCompanyCount = payload.companies?.length || 0;
    payloadCacheCount = payload.summary?.from_cache || 0;
    setFeedback("Status atualizado com sucesso.", "success");
  } catch (error) {
    const isNetworkFailure = error instanceof TypeError && error.message === "Failed to fetch";
    setFeedback(
      isNetworkFailure
        ? "Nao foi possivel conectar ao servidor local. Verifique se o npm start continua aberto."
        : error.message || "Erro ao consultar APIs.",
      "error",
    );
  } finally {
    refreshEnvironmentStatus();
    const finishedAt = nowMs();
    if (requestStartedAt) {
      logPullStatusFrontendPerformance({
        force_refresh: forceRefresh,
        companies_received: payloadCompanyCount,
        from_cache: payloadCacheCount,
        click_to_request_ms: roundMs(requestStartedAt - flowStartedAt),
        function_start_delay_ms: roundMs(functionStartedAt - flowStartedAt),
        backend_wait_ms: responseReceivedAt ? roundMs(responseReceivedAt - requestStartedAt) : null,
        json_parse_ms: responseReceivedAt && jsonParsedAt ? roundMs(jsonParsedAt - responseReceivedAt) : null,
        state_update_ms: jsonParsedAt && stateUpdatedAt ? roundMs(stateUpdatedAt - jsonParsedAt) : null,
        render_ms: stateUpdatedAt && renderFinishedAt ? roundMs(renderFinishedAt - stateUpdatedAt) : null,
        total_frontend_ms: roundMs(finishedAt - flowStartedAt),
      });
    }
    state.isPullingStatus = false;
    updateButtonsState();
    setLoading(false);
  }
}

function closeModal() {
  closeModalExportMenu();
  setModalExportFeedback("");
  elements.companyModal.classList.add("hidden");
  elements.companyModal.setAttribute("aria-hidden", "true");
  state.selectedCompanyId = null;
}

function openModal(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  const status = getStatus(companyId);
  if (!company || !status) {
    return;
  }

  state.selectedCompanyId = companyId;
  state.modalFilter = "all";

  elements.modalTitle.textContent = company.name;
  elements.modalSubtitle.textContent = `CNPJ ${company.identifier} | Ativos: ${status.active_clock_count} | Atualizado em ${status.updated_at}`;

  renderModalCards();
  updateModalFilterButtons();

  elements.companyModal.classList.remove("hidden");
  elements.companyModal.setAttribute("aria-hidden", "false");
}

function getModalRows() {
  const status = getStatus(state.selectedCompanyId);
  if (!status) return [];

  const clocks = status.clocks || [];
  if (state.modalFilter === "online") {
    return clocks.filter((clock) => clock.is_communicating);
  }
  if (state.modalFilter === "offline") {
    return clocks.filter((clock) => !clock.is_communicating);
  }
  return clocks;
}

function createClockField(label, value) {
  const row = document.createElement("div");
  row.className = "modal-clock-row";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const valueEl = document.createElement("strong");
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

function getClockFabricationNumber(clock) {
  const candidates = [
    clock?.fabrication_number,
    clock?.fabricationNumber,
    clock?.NumeroFabricacao,
    clock?.numeroFabricacao,
    clock?.numero_fabricacao,
    clock?.numero_serie,
    clock?.numeroSerie,
    clock?.NumeroSerie,
    clock?.serial_number,
    clock?.serialNumber,
    clock?.serial,
    clock?.Serial,
  ];

  for (const item of candidates) {
    const text = String(item ?? "").trim();
    if (text && text.toLowerCase() !== "null") {
      return text;
    }
  }
  return "-";
}

function createClockDetailCard(clock) {
  const statusClass = clock.is_communicating ? "ok" : "error";
  const statusLabel = clock.is_communicating ? "OK" : "Falha";

  const card = document.createElement("article");
  card.className = `modal-clock-card ${statusClass}`;

  const header = document.createElement("header");
  header.className = "modal-clock-header";

  const title = document.createElement("h4");
  title.textContent = clock.name;

  header.append(title);

  const body = document.createElement("div");
  body.className = "modal-clock-body";
  body.append(
    createClockField("Codigo", String(clock.code)),
    // Exibe NumeroFabricacao retornado pela API (quando existir).
    createClockField("Numero Fabricacao", getClockFabricationNumber(clock)),
    createClockField("IP", String(clock.ip)),
    createClockField("Ultima Coleta (BRT)", String(clock.last_collection_brt)),
  );

  const footer = document.createElement("footer");
  footer.className = "modal-clock-footer";

  const status = document.createElement("span");
  status.className = `modal-clock-status ${statusClass}`;
  status.textContent = statusLabel;

  footer.append(status);
  card.append(header, body, footer);
  return card;
}

function formatCompactCollectionDate(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return "-";
  }

  const match = text.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})$/);
  if (!match) {
    return text;
  }

  const [, datePart, timePart] = match;
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return datePart === today ? timePart : `${datePart} ${timePart}`;
}

function createClockCompactCard(clock) {
  const statusClass = clock.is_communicating ? "ok" : "error";
  const statusLabel = clock.is_communicating ? "OK" : "Falha";

  const card = document.createElement("article");
  card.className = `modal-clock-card modal-clock-card-compact ${statusClass}`;

  const top = document.createElement("div");
  top.className = "compact-clock-top";

  const title = document.createElement("h4");
  title.className = "compact-clock-name";
  title.textContent = clock.name;
  title.title = clock.name;

  const code = document.createElement("span");
  code.className = "compact-code-badge";
  code.textContent = `#${clock.code}`;
  code.title = `Codigo ${clock.code}`;

  top.append(title, code);

  const meta = document.createElement("div");
  meta.className = "compact-clock-meta";

  const lastCollection = document.createElement("span");
  lastCollection.className = "compact-clock-time";
  lastCollection.textContent = formatCompactCollectionDate(clock.last_collection_brt);
  lastCollection.title = String(clock.last_collection_brt || "-");

  const status = document.createElement("span");
  status.className = `compact-clock-status ${statusClass}`;
  status.textContent = statusLabel;

  meta.append(lastCollection, status);
  card.append(top, meta);
  return card;
}

function renderModalCards() {
  const status = getStatus(state.selectedCompanyId);
  const rows = getModalRows();

  elements.modalCardsGrid.innerHTML = "";
  updateModalLayoutToggle();

  if (!status) {
    return;
  }

  if (!rows.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "modal-empty-state";
    emptyState.textContent = "Nenhum relogio encontrado para o filtro selecionado.";
    elements.modalCardsGrid.appendChild(emptyState);
    return;
  }

  rows.forEach((clock) => {
    const card =
      state.modalLayout === "compact"
        ? createClockCompactCard(clock)
        : createClockDetailCard(clock);
    elements.modalCardsGrid.appendChild(card);
  });
}

function updateModalFilterButtons() {
  const allButtons = [
    [elements.showAllBtn, "all"],
    [elements.showOnlineBtn, "online"],
    [elements.showOfflineBtn, "offline"],
  ];

  allButtons.forEach(([button, value]) => {
    button.classList.toggle("active", state.modalFilter === value);
  });
}

function setModalFilter(filter) {
  state.modalFilter = filter;
  closeModalExportMenu();
  setModalExportFeedback("");
  updateModalFilterButtons();
  renderModalCards();
}

function setSelectedSystem(system) {
  state.selectedSystem = system;
  clearSearchAutoSwitchState();
  renderDashboard();
}

function setCompanyStatusFilter(filter, allowAutoSwitch = false) {
  state.companyStatusFilter = ["all", "offline", "ok"].includes(filter) ? filter : "all";
  if (allowAutoSwitch) {
    applyAutomaticSystemSwitch();
  } else {
    state.companyAutoSwitchMessage = "";
  }
  renderDashboard();
}

function toggleAlphabeticalSort() {
  state.isAlphabeticalSortActive = !state.isAlphabeticalSortActive;
  renderDashboard();
}

function setCompanySearchTerm(term) {
  state.companySearchTerm = term;

  if (!hasCompanySearchTerm()) {
    restoreSystemAfterSearchClear();
    renderDashboard();
    return;
  }

  applyAutomaticSystemSwitch();
  renderDashboard();
}

function startClock() {
  const formatTime = () => {
    const now = new Date();
    elements.currentTime.textContent = now.toLocaleTimeString("pt-BR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  formatTime();
  setInterval(formatTime, 1000);
}

async function init() {
  state.modalLayout = getStoredModalLayout();
  setupModalLayoutToggle();
  setupModalExportControls();
  await loadDesktopPreferences();
  updateButtonsState();
  setOperationalSummary([], { from_cache: 0 });
  renderDashboard();
  startClock();
  refreshEnvironmentStatus();
  setInterval(refreshEnvironmentStatus, 60 * 1000);

  try {
    const response = await fetch("/api/companies");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(parseErrorMessage(payload));
    }

    state.companies = payload.companies || [];
    renderDashboard();
    updateButtonsState();

    if (state.companies.length) {
      setFeedback("Base carregada do servidor. Clique em Puxar Status para consultar APIs.");
    }
  } catch (error) {
    setFeedback(error.message || "Falha ao carregar empresas iniciais.", "error");
  }
}

elements.importButton.addEventListener("click", importCompanies);
elements.pullStatusButton.addEventListener("click", () => {
  const clickedAt = nowMs();
  pullStatus(false, clickedAt);
});
elements.companySearchInput.addEventListener("input", (event) => {
  setCompanySearchTerm(event.target.value);
});
elements.companyFilterButtons.forEach((button) => {
  if (button.id === "companySortAlphabetical") {
    return;
  }
  button.addEventListener("click", () => setCompanyStatusFilter(button.dataset.filter || "all", true));
});
elements.companySortAlphabetical?.addEventListener("click", toggleAlphabeticalSort);

elements.startWithWindowsToggle?.addEventListener("click", () => {
  updateDesktopPreference("startWithWindows", !state.desktopPreferences.startWithWindows);
});

elements.minimizeToTrayToggle?.addEventListener("click", () => {
  updateDesktopPreference("minimizeToTray", !state.desktopPreferences.minimizeToTray);
});

elements.tabDimep.addEventListener("click", () => setSelectedSystem("DIMEP"));
elements.tabMadis.addEventListener("click", () => setSelectedSystem("MADIS"));

elements.closeModalButton.addEventListener("click", closeModal);
elements.showAllBtn.addEventListener("click", () => setModalFilter("all"));
elements.showOnlineBtn.addEventListener("click", () => setModalFilter("online"));
elements.showOfflineBtn.addEventListener("click", () => setModalFilter("offline"));

document.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeModal();
    return;
  }

  if (
    target instanceof Node &&
    elements.modalExportWrapper &&
    !elements.modalExportWrapper.contains(target)
  ) {
    closeModalExportMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

init();

