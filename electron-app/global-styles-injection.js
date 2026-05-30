(() => {
  if (document.getElementById("electron-global-scrollbar-style")) return;

  const style = document.createElement("style");
  style.id = "electron-global-scrollbar-style";
  style.textContent = `
    @font-face {
      font-family: "Inter";
      src: url("/static/fonts/InterVariable.ttf") format("truetype");
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "Inter";
      src: url("/static/fonts/InterVariable-Italic.ttf") format("truetype");
      font-weight: 100 900;
      font-style: italic;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Text";
      src: url("/static/fonts/SF-Pro-Text-Regular.otf") format("opentype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Text";
      src: url("/static/fonts/SF-Pro-Text-Medium.otf") format("opentype");
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Text";
      src: url("/static/fonts/SF-Pro-Text-Semibold.otf") format("opentype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Text";
      src: url("/static/fonts/SF-Pro-Text-Bold.otf") format("opentype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Display";
      src: url("/static/fonts/SF-Pro-Display-Semibold.otf") format("opentype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    @font-face {
      font-family: "SF Pro Display";
      src: url("/static/fonts/SF-Pro-Display-Bold.otf") format("opentype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    :root {
      --bg-night-0: #020817;
      --bg-night-1: #03112a;
      --bg-night-2: #0a2f63;
      --bg-night-3: #0d4b8a;
      --text-main: #f0f8ff;
      --text-soft: #a7d0f5;
      --stroke: rgba(120, 188, 255, 0.34);
      --stroke-strong: rgba(145, 206, 255, 0.54);
      --font-display: "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      --font-body: "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      --font-mono: "Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    }

    html,
    body {
      background:
        radial-gradient(circle at 18% 12%, rgba(15, 96, 185, 0.6) 0%, transparent 30%),
        radial-gradient(circle at 82% 8%, rgba(0, 188, 242, 0.34) 0%, transparent 28%),
        radial-gradient(circle at 70% 82%, rgba(36, 118, 235, 0.5) 0%, transparent 35%),
        linear-gradient(150deg, #020817 8%, #03112a 34%, #0a2f63 72%, #0d4b8a 100%) !important;
    }

    body {
      color: var(--text-main) !important;
      font-family: var(--font-body) !important;
    }

    .app-shell {
      filter: saturate(1.12) contrast(1.06);
    }

    button,
    input,
    textarea,
    select,
    .tag,
    .status-pill,
    .feedback {
      font-family: var(--font-body) !important;
    }

    h1,
    h2,
    h3,
    h4,
    .kicker,
    .section-kicker {
      font-family: var(--font-display) !important;
    }

    .kicker,
    .section-kicker {
      font-weight: 500 !important;
    }

    .hero-card h1 {
      font-weight: 700 !important;
    }

    .btn {
      font-weight: 600 !important;
    }

    .summary-item strong,
    .status-card strong,
    .time-card strong,
    #currentTime,
    #totalCompanies,
    #dimepCompanies,
    #madisCompanies,
    #communicatingClocks,
    #offlineClocks,
    #errorCompanies,
    .modal-code-badge,
    .modal-clock-row strong,
    #cacheLabel,
    #lastUpdateLabel,
    .count-badge,
    .company-card > p:first-of-type,
    .company-card > p:last-child,
    .company-meta span:last-child,
    .modal-header p {
      font-family: var(--font-mono) !important;
      font-variant-numeric: tabular-nums !important;
    }

    #currentTime,
    #totalCompanies,
    #dimepCompanies,
    #madisCompanies,
    #communicatingClocks,
    #offlineClocks,
    #errorCompanies {
      font-weight: 600 !important;
    }

    #lastUpdateLabel,
    .company-card > p:first-of-type,
    .modal-header p {
      font-weight: 400 !important;
    }

    .company-card > p:last-child,
    .company-meta span:last-child,
    .count-badge {
      font-weight: 500 !important;
    }

    .bg-atmosphere::before {
      background: radial-gradient(circle, rgba(53, 162, 255, 0.46), rgba(53, 162, 255, 0)) !important;
      opacity: 0.72 !important;
    }

    .bg-atmosphere::after {
      background: radial-gradient(circle, rgba(0, 188, 242, 0.42), rgba(0, 188, 242, 0)) !important;
      opacity: 0.72 !important;
    }

    .panel-glass {
      border-color: rgba(72, 156, 232, 0.34) !important;
      background: linear-gradient(140deg, rgba(3, 13, 35, 0.88), rgba(3, 31, 72, 0.74)) !important;
      box-shadow:
        0 8px 32px rgba(0, 7, 20, 0.58),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
      backdrop-filter: blur(24px) saturate(195%) brightness(0.88) contrast(1.18) !important;
      -webkit-backdrop-filter: blur(24px) saturate(195%) brightness(0.88) contrast(1.18) !important;
    }

    .panel-glass::before {
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.01) 42%),
        radial-gradient(circle at 80% 0%, rgba(0, 188, 242, 0.13), rgba(0, 188, 242, 0) 45%) !important;
    }

    .summary-item,
    .company-card,
    .modal-clock-card,
    .file-input,
    .time-card,
    .feedback,
    .count-badge {
      background-color: rgba(4, 18, 42, 0.62) !important;
    }

    .summary-item {
      background: linear-gradient(140deg, rgba(3, 13, 35, 0.86), rgba(5, 29, 68, 0.68)) !important;
    }

    .hero-card {
      background: linear-gradient(140deg, rgba(3, 16, 43, 0.94), rgba(5, 44, 93, 0.78)) !important;
      border-color: rgba(77, 170, 255, 0.4) !important;
      box-shadow:
        0 10px 34px rgba(0, 7, 20, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
      filter: saturate(1.16) contrast(1.08) !important;
    }

    .hero-card::before {
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.01) 42%),
        radial-gradient(circle at 82% 0%, rgba(0, 188, 242, 0.2), rgba(0, 188, 242, 0) 46%) !important;
    }

    .hero-card h1 {
      color: #f3f9ff !important;
      text-shadow: 0 5px 18px rgba(0, 7, 20, 0.45) !important;
    }

    .hero-description {
      color: #b7d9f6 !important;
    }

    .tag {
      border-color: rgba(120, 188, 255, 0.34) !important;
      background: linear-gradient(135deg, rgba(5, 28, 66, 0.78), rgba(6, 39, 88, 0.56)) !important;
      color: #d7efff !important;
      box-shadow:
        0 4px 14px rgba(0, 7, 20, 0.26),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
    }

    .status-pill {
      border-color: rgba(45, 209, 125, 0.5) !important;
      background: linear-gradient(135deg, rgba(10, 72, 61, 0.82), rgba(6, 41, 61, 0.62)) !important;
      color: #9ff0c9 !important;
      box-shadow:
        0 6px 18px rgba(45, 209, 125, 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
    }

    .status-pill.status-pill-inactive {
      border-color: rgba(255, 107, 136, 0.46) !important;
      background:
        radial-gradient(circle at 16% 50%, rgba(255, 79, 112, 0.15), transparent 36%),
        linear-gradient(135deg, rgba(58, 7, 17, 0.5), rgba(21, 34, 64, 0.36)) !important;
      color: #ffb0c0 !important;
      box-shadow:
        0 0 18px rgba(255, 79, 112, 0.13),
        inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
    }

    .status-pill.status-pill-inactive .status-dot-live {
      background: #ff4f70 !important;
      box-shadow:
        0 0 9px rgba(255, 79, 112, 0.74),
        0 0 16px rgba(255, 79, 112, 0.18) !important;
    }

    .time-card {
      border-color: rgba(120, 188, 255, 0.38) !important;
      background: linear-gradient(135deg, rgba(3, 18, 47, 0.9), rgba(5, 36, 82, 0.68)) !important;
      box-shadow:
        0 6px 18px rgba(0, 7, 20, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.06) !important;
    }

    .company-card,
    .modal-clock-card {
      background: linear-gradient(135deg, rgba(3, 16, 43, 0.94), rgba(5, 39, 86, 0.76)) !important;
    }

    .companies-panel {
      background: linear-gradient(140deg, rgba(4, 18, 44, 0.9), rgba(5, 44, 93, 0.78)) !important;
      border-color: rgba(77, 170, 255, 0.38) !important;
      box-shadow:
        0 8px 34px rgba(0, 7, 20, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
    }

    .companies-panel::before {
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.01) 42%),
        radial-gradient(circle at 82% 0%, rgba(0, 188, 242, 0.2), rgba(0, 188, 242, 0) 46%) !important;
    }

    .count-badge {
      border-color: rgba(120, 188, 255, 0.36) !important;
      background: linear-gradient(135deg, rgba(5, 28, 66, 0.86), rgba(7, 45, 98, 0.64)) !important;
      color: #b9defa !important;
      box-shadow:
        0 4px 14px rgba(0, 7, 20, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
    }

    .company-card {
      border-color: rgba(78, 169, 255, 0.3) !important;
      background: linear-gradient(135deg, rgba(3, 16, 43, 0.94), rgba(5, 39, 86, 0.78)) !important;
      box-shadow:
        0 10px 26px rgba(0, 7, 20, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      filter: saturate(1.16) contrast(1.08) !important;
    }

    .company-card.ok {
      border-left-color: #2dd17d !important;
    }

    .company-card.error {
      border-left-color: #ff2f5f !important;
    }

    .company-card:hover {
      border-color: rgba(160, 220, 255, 0.62) !important;
      background: linear-gradient(135deg, rgba(4, 20, 52, 0.98), rgba(7, 48, 105, 0.86)) !important;
      box-shadow:
        0 16px 48px rgba(59, 130, 246, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.09) !important;
      filter: saturate(1.24) contrast(1.12) brightness(1.03) !important;
    }

    .company-card.ok:hover {
      border-left-color: #2dd17d !important;
      box-shadow:
        0 16px 48px rgba(45, 209, 125, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.09) !important;
    }

    .company-card.error:hover {
      border-left-color: #ff4f70 !important;
      box-shadow:
        0 16px 48px rgba(255, 79, 112, 0.32),
        inset 0 1px 0 rgba(255, 255, 255, 0.09) !important;
    }

    .company-card h3 {
      color: #f3f9ff !important;
    }

    .company-card p,
    .company-meta {
      color: #b7d9f6 !important;
    }

    .status-dot.ok {
      background: #2dd17d !important;
      box-shadow: 0 0 10px rgba(45, 209, 125, 0.85) !important;
    }

    .status-dot.error {
      background: #ff2f5f !important;
      box-shadow: 0 0 10px rgba(255, 79, 112, 0.85) !important;
    }

    .status-card {
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.045),
        0 8px 20px rgba(0, 7, 20, 0.26) !important;
      filter: saturate(1.15) contrast(1.08) !important;
      transition:
        border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
        filter 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .ok-bg {
      border-color: rgba(45, 209, 125, 0.5) !important;
      background: linear-gradient(95deg, rgba(45, 209, 125, 0.3), rgba(9, 34, 71, 0.45)) !important;
    }

    .error-bg {
      border-color: rgba(255, 79, 112, 0.5) !important;
      background: linear-gradient(95deg, rgba(224, 66, 104, 0.22), rgba(9, 34, 71, 0.45)) !important;
    }

    .warn-bg {
      border-color: rgba(255, 190, 59, 0.42) !important;
      background: linear-gradient(95deg, rgba(206, 151, 46, 0.22), rgba(9, 34, 71, 0.45)) !important;
    }

    .status-card.ok-bg:hover {
      border-color: rgba(45, 209, 125, 0.86) !important;
      box-shadow:
        0 0 20px rgba(45, 209, 125, 0.62),
        0 8px 24px rgba(45, 209, 125, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      filter: saturate(1.25) contrast(1.12) brightness(1.04) !important;
      transform: translateY(-1px);
    }

    .status-card.error-bg:hover {
      border-color: rgba(255, 79, 112, 0.86) !important;
      box-shadow:
        0 0 20px rgba(255, 79, 112, 0.62),
        0 8px 24px rgba(255, 79, 112, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      filter: saturate(1.25) contrast(1.12) brightness(1.04) !important;
      transform: translateY(-1px);
    }

    .status-card.warn-bg:hover {
      border-color: rgba(255, 190, 59, 0.82) !important;
      box-shadow:
        0 0 20px rgba(255, 190, 59, 0.58),
        0 8px 24px rgba(255, 190, 59, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
      filter: saturate(1.25) contrast(1.12) brightness(1.04) !important;
      transform: translateY(-1px);
    }

    .btn-primary,
    .btn-template,
    .btn-cta,
    .tab-button.active {
      filter: saturate(1.08) contrast(1.03);
    }

    .btn-primary,
    .btn-template,
    .btn-cta {
      filter: saturate(1.2) contrast(1.08) !important;
    }

    .tab-button.active {
      filter: saturate(1.22) contrast(1.08) !important;
    }

    .tab-button[data-system="DIMEP"].active {
      border-color: rgba(126, 237, 179, 0.68) !important;
      background: linear-gradient(130deg, #35d986, #108a59) !important;
      box-shadow:
        0 10px 26px rgba(45, 209, 125, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
    }

    .tab-button[data-system="MADIS"].active {
      border-color: rgba(178, 228, 255, 0.72) !important;
      background: linear-gradient(130deg, #78d8ff, #168edf) !important;
      box-shadow:
        0 10px 26px rgba(104, 205, 255, 0.46),
        inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
    }

    .btn-success {
      color: #f1fff8 !important;
      text-shadow: 0 1px 7px rgba(0, 28, 17, 0.38) !important;
    }

    .btn-danger {
      color: #fff7fa !important;
      text-shadow: 0 1px 7px rgba(61, 0, 14, 0.38) !important;
    }

    .modal-clock-status.ok {
      color: #f1fff8 !important;
      text-shadow: 0 1px 7px rgba(0, 28, 17, 0.42) !important;
    }

    .modal-clock-status.error {
      color: #fff7fa !important;
      text-shadow: 0 1px 7px rgba(61, 0, 14, 0.42) !important;
    }

    .modal-clock-status {
      min-height: 22px !important;
      padding: 0 9px !important;
      line-height: 1 !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .modal-clock-card {
      border-color: rgba(72, 156, 232, 0.34) !important;
      box-shadow:
        0 8px 22px rgba(0, 7, 20, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
      filter: saturate(1.12) contrast(1.05) !important;
    }

    .modal-clock-card.ok {
      border-color: rgba(45, 209, 125, 0.46) !important;
    }

    .modal-clock-card.error {
      border-color: rgba(255, 79, 112, 0.5) !important;
    }

    .modal-clock-card:hover {
      border-color: rgba(160, 220, 255, 0.6) !important;
      box-shadow:
        0 14px 36px rgba(20, 147, 255, 0.18),
        0 8px 24px rgba(0, 7, 20, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
      filter: saturate(1.22) contrast(1.1) brightness(1.03) !important;
    }

    .modal-code-badge,
    .compact-code-badge {
      border-color: rgba(120, 188, 255, 0.36) !important;
      background: linear-gradient(135deg, rgba(5, 28, 66, 0.84), rgba(7, 45, 98, 0.62)) !important;
      color: #bfe4ff !important;
    }

    .compact-clock-status.ok {
      color: #8cffc2 !important;
    }

    .compact-clock-status.error {
      color: #ff9bb0 !important;
    }

    .modal,
    .loading-overlay {
      filter: none !important;
    }

    .loading-overlay {
      background: rgba(0, 12, 31, 0.46) !important;
      backdrop-filter: blur(3px) saturate(116%) !important;
      -webkit-backdrop-filter: blur(3px) saturate(116%) !important;
    }

    .loader-card.panel-glass {
      border-color: rgba(132, 198, 255, 0.36) !important;
      background:
        radial-gradient(circle at 78% 0%, rgba(0, 188, 242, 0.16), transparent 46%),
        linear-gradient(140deg, rgba(8, 24, 52, 0.58), rgba(8, 30, 63, 0.47)) !important;
      box-shadow:
        0 10px 34px rgba(0, 7, 20, 0.5),
        0 0 26px rgba(20, 147, 255, 0.15),
        inset 0 1px 0 rgba(190, 228, 255, 0.2),
        inset 0 0 24px rgba(120, 188, 255, 0.07) !important;
      backdrop-filter: blur(27px) saturate(158%) !important;
      -webkit-backdrop-filter: blur(27px) saturate(158%) !important;
    }

    .loader-card.panel-glass::before {
      background:
        linear-gradient(125deg, rgba(176, 222, 255, 0.14), rgba(176, 222, 255, 0.025) 40%),
        radial-gradient(circle at 80% 0%, rgba(0, 188, 242, 0.18), rgba(0, 188, 242, 0) 44%) !important;
    }

    .modal {
      position: fixed !important;
      inset: 0 !important;
      z-index: 110 !important;
    }

    .modal.hidden {
      display: none !important;
    }

    .modal-content {
      border-color: rgba(72, 156, 232, 0.46) !important;
      background: linear-gradient(140deg, rgba(3, 14, 42, 0.96), rgba(4, 46, 101, 0.84)) !important;
      box-shadow:
        0 20px 54px rgba(0, 7, 20, 0.58),
        0 0 34px rgba(20, 147, 255, 0.12),
        inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
      backdrop-filter: blur(26px) saturate(185%) brightness(0.96) contrast(1.08) !important;
      -webkit-backdrop-filter: blur(26px) saturate(185%) brightness(0.96) contrast(1.08) !important;
    }

    .modal:not(.hidden) {
      display: grid !important;
      place-items: center !important;
      padding: 24px !important;
      overflow: hidden !important;
    }

    .modal-backdrop {
      position: fixed !important;
      inset: 0 !important;
      background: rgba(1, 8, 25, 0.68) !important;
      backdrop-filter: blur(2px) saturate(135%) !important;
      -webkit-backdrop-filter: blur(2px) saturate(135%) !important;
    }

    .modal-content {
      position: relative !important;
      width: min(860px, calc(100vw - 48px)) !important;
      max-height: min(76vh, 660px) !important;
      margin: 0 !important;
      display: grid !important;
      grid-template-rows: auto auto minmax(0, 1fr) !important;
      overflow: hidden !important;
      transform: translateZ(0);
    }

    .modal-cards-wrapper {
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding: 12px 14px 14px !important;
      background:
        radial-gradient(circle at 78% 8%, rgba(0, 188, 242, 0.12), transparent 38%),
        linear-gradient(180deg, rgba(3, 19, 49, 0.18), rgba(3, 13, 35, 0.02)) !important;
    }

    .modal-cards-grid {
      align-content: start !important;
    }

    /* Scrollbar fina e escura combinando com o tema do painel */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
    ::-webkit-scrollbar-corner { background: transparent; }
  `;
  document.head.appendChild(style);
})();
