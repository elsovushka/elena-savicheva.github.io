/* ═══════════════════════════════════════════════════════
   ФИНАНСОВАЯ МОДЕЛЬ — MAIN APP JS
═══════════════════════════════════════════════════════ */

'use strict';

// ─── STATE ───────────────────────────────────────────
const state = {
  lastResults: null,
  lastParams: null,
  lastCashflow: null,
  chart: null,
  compareSelected: [],
};

// ─── DEFAULT PARAMS ──────────────────────────────────
const DEFAULTS = {
  area: 1200,
  apartments: 20,
  horizon: 13,
  purchase_price: 110000,
  extra_costs: 2432000,
  reconstruction_price: 45000,
  reconstruction_period: 4,
  reconstruction_schedule: [25, 25, 25, 25],
  rent_monthly: 45000,
  rent_start_q: 5,
  rent_end_q: 8,
  occupancy_schedule: [50, 80, 100, 100],
  opex_monthly: 175000,
  sale_price: 230000,
  sale_start_q: 9,
  sale_schedule: [5, 6, 6, 3],
  debt_ratio: 60,
  interest_rate: 14.5,
  loan_period: 16,
  grace_period: 4,
  usn_mode: 'income_expense',
  usn_rate: 15,
  property_tax_rate: 2.2,
  depreciation_rate: 2,
  discount_rate: 20,
};

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAccordions();
  initDynamicSchedules();
  initEventListeners();
  updateCalcValues();
  calculate(); // первый расчёт при загрузке
});

// ═══════════════════════════════════════════════════════
// ACCORDIONS
// ═══════════════════════════════════════════════════════
function initAccordions() {
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const acc = header.closest('.accordion');
      const isOpen = acc.dataset.open === 'true';
      acc.dataset.open = isOpen ? 'false' : 'true';
    });
  });
}

// ═══════════════════════════════════════════════════════
// DYNAMIC SCHEDULE GRIDS
// ═══════════════════════════════════════════════════════
function initDynamicSchedules() {
  buildReconSchedule();
  buildOccupancySchedule();
  buildSaleSchedule();

  // пересобирать при изменении периодов
  on('reconstruction_period', 'change', buildReconSchedule);
  on('rent_start_q', 'change', buildOccupancySchedule);
  on('rent_end_q', 'change', buildOccupancySchedule);
  on('sale_start_q', 'change', buildSaleSchedule);
  on('horizon', 'change', buildSaleSchedule);
}

function buildReconSchedule() {
  const n = intVal('reconstruction_period', 4);
  const cur = getScheduleValues('reconScheduleContainer');
  const defaults = DEFAULTS.reconstruction_schedule;
  buildScheduleGrid('reconScheduleContainer', n, 'reconQ', cur, defaults, '%', (idx) => `Q${idx + 1}`);
  updateCalcValues();
}

function buildOccupancySchedule() {
  const start = intVal('rent_start_q', 5);
  const end   = intVal('rent_end_q', 8);
  const n = Math.max(0, end - start + 1);
  const cur = getScheduleValues('occupancyContainer');
  const defaults = DEFAULTS.occupancy_schedule;
  buildScheduleGrid('occupancyContainer', n, 'occQ', cur, defaults, '%', (idx) => `Q${start + idx}`);
}

function buildSaleSchedule() {
  const saleStart = intVal('sale_start_q', 9);
  const horizon   = intVal('horizon', 13);
  const n = Math.max(1, horizon - saleStart);
  const cur = getScheduleValues('saleScheduleContainer');
  const defaults = DEFAULTS.sale_schedule;
  buildScheduleGrid('saleScheduleContainer', n, 'saleQ', cur, defaults, 'кв', (idx) => `Q${saleStart + idx}`);
  updateCalcValues();
}

function buildScheduleGrid(containerId, n, prefix, currentVals, defaultVals, unit, labelFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const val = currentVals[i] !== undefined ? currentVals[i] : (defaultVals[i] !== undefined ? defaultVals[i] : 0);
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.innerHTML = `
      <label>${labelFn(i)}</label>
      <input type="number" id="${prefix}_${i}" value="${val}" min="0" step="1" data-schedule="${containerId}"/>
      <span style="font-size:.7rem;color:var(--c-muted);text-align:center">${unit}</span>`;
    container.appendChild(item);
  }
  // listen for changes on new inputs
  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', updateCalcValues);
  });
}

function getScheduleValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input')).map(i => parseFloat(i.value) || 0);
}

// ═══════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════
function initEventListeners() {
  // CALCULATE
  document.getElementById('btnCalculate').addEventListener('click', calculate);

  // Auto-recalc on input change (debounced)
  document.querySelectorAll('#paramsPanel input, #paramsPanel select').forEach(el => {
    el.addEventListener('change', () => {
      updateCalcValues();
      debouncedCalculate();
    });
    if (el.tagName === 'INPUT') {
      el.addEventListener('input', updateCalcValues);
    }
  });

  // HEADER BUTTONS
  document.getElementById('btnSave').addEventListener('click', () => openModal('modalSave'));
  document.getElementById('btnLoad').addEventListener('click', () => { loadScenarioList('scenarioList', 'load'); openModal('modalLoad'); });
  document.getElementById('btnCompare').addEventListener('click', () => { loadScenarioList('compareSelectList', 'compare'); openModal('modalCompare'); });
  document.getElementById('btnExportPDF').addEventListener('click', exportPDF);
  document.getElementById('btnAIAnalysis').addEventListener('click', requestAIAnalysis);

  // SAVE MODAL
  document.getElementById('btnSaveConfirm').addEventListener('click', saveScenario);
  document.getElementById('scenarioName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveScenario();
  });

  // COMPARE
  document.getElementById('btnCompareRun').addEventListener('click', runCompare);

  // MODAL CLOSES
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // COLLAPSIBLE QUARTERLY TABLE
  document.querySelector('.collapsible-title[data-target="quarterlyTable"]').addEventListener('click', function () {
    const target = document.getElementById('quarterlyTable');
    const chevron = this.querySelector('.section-chevron');
    const isHidden = target.style.display === 'none';
    target.style.display = isHidden ? 'block' : 'none';
    chevron.classList.toggle('rotated', isHidden);
  });

  // PANEL TOGGLE
  document.getElementById('toggleParams').addEventListener('click', () => {
    const panel = document.getElementById('paramsPanel');
    const icon  = document.querySelector('#toggleParams i');
    panel.classList.toggle('collapsed');
    icon.className = panel.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    if (state.chart) setTimeout(() => state.chart.resize(), 320);
  });

  // USN mode → auto-set rate
  document.getElementById('usn_mode').addEventListener('change', function () {
    const rateEl = document.getElementById('usn_rate');
    rateEl.value = this.value === 'income' ? 6 : 15;
  });
}

const debouncedCalculate = debounce(calculate, 600);

// ═══════════════════════════════════════════════════════
// LIVE CALCULATED DISPLAY VALUES
// ═══════════════════════════════════════════════════════
function updateCalcValues() {
  const area  = floatVal('area', 1200);
  const apts  = intVal('apartments', 20);
  const pPrc  = floatVal('purchase_price', 110000);
  const extra = floatVal('extra_costs', 2432000);
  const rPrc  = floatVal('reconstruction_price', 45000);
  const dRatio = floatVal('debt_ratio', 60) / 100;

  const avgArea = apts > 0 ? (area / apts).toFixed(1) : '—';
  setText('avgAptArea', `${avgArea} м²`);

  const totalPurchase = area * pPrc + extra;
  setText('totalPurchase', fmtRub(totalPurchase));

  const totalRecon = area * rPrc;
  setText('totalRecon', fmtRub(totalRecon));

  const totalCapex = totalPurchase + totalRecon;
  setText('loanAmount', fmtRub(totalCapex * dRatio));

  // total sales revenue estimate
  const salePrice = floatVal('sale_price', 230000);
  const saleSchedule = getScheduleValues('saleScheduleContainer');
  const totalApts = saleSchedule.reduce((a, b) => a + b, 0);
  const avgAptAreaNum = apts > 0 ? area / apts : 0;
  const totalSales = totalApts * avgAptAreaNum * salePrice;
  setText('totalSalesRevenue', fmtRub(totalSales));
}

// ═══════════════════════════════════════════════════════
// COLLECT PARAMS FROM FORM
// ═══════════════════════════════════════════════════════
function collectParams() {
  return {
    area:                   floatVal('area', DEFAULTS.area),
    apartments:             intVal('apartments', DEFAULTS.apartments),
    horizon:                intVal('horizon', DEFAULTS.horizon),
    purchase_price:         floatVal('purchase_price', DEFAULTS.purchase_price),
    extra_costs:            floatVal('extra_costs', DEFAULTS.extra_costs),
    reconstruction_price:   floatVal('reconstruction_price', DEFAULTS.reconstruction_price),
    reconstruction_period:  intVal('reconstruction_period', DEFAULTS.reconstruction_period),
    reconstruction_schedule: getScheduleValues('reconScheduleContainer'),
    rent_monthly:           floatVal('rent_monthly', DEFAULTS.rent_monthly),
    rent_start_q:           intVal('rent_start_q', DEFAULTS.rent_start_q),
    rent_end_q:             intVal('rent_end_q', DEFAULTS.rent_end_q),
    occupancy_schedule:     getScheduleValues('occupancyContainer'),
    opex_monthly:           floatVal('opex_monthly', DEFAULTS.opex_monthly),
    sale_price:             floatVal('sale_price', DEFAULTS.sale_price),
    sale_start_q:           intVal('sale_start_q', DEFAULTS.sale_start_q),
    sale_schedule:          getScheduleValues('saleScheduleContainer'),
    debt_ratio:             floatVal('debt_ratio', DEFAULTS.debt_ratio),
    interest_rate:          floatVal('interest_rate', DEFAULTS.interest_rate),
    loan_period:            intVal('loan_period', DEFAULTS.loan_period),
    grace_period:           intVal('grace_period', DEFAULTS.grace_period),
    usn_mode:               document.getElementById('usn_mode').value,
    usn_rate:               floatVal('usn_rate', DEFAULTS.usn_rate),
    property_tax_rate:      floatVal('property_tax_rate', DEFAULTS.property_tax_rate),
    depreciation_rate:      floatVal('depreciation_rate', DEFAULTS.depreciation_rate),
    discount_rate:          floatVal('discount_rate', DEFAULTS.discount_rate),
  };
}

// ═══════════════════════════════════════════════════════
// CALCULATE
// ═══════════════════════════════════════════════════════
async function calculate() {
  const params = collectParams();
  showLoader(true);

  try {
    const res = await apiPost('/calculate', params);
    if (!res.success) { showToast(res.error || 'Ошибка расчёта', 'error'); return; }

    state.lastResults  = res.results;
    state.lastParams   = params;
    state.lastCashflow = res.cashflow;

    renderKPIs(res.results);
    renderFinTable(res.results);
    renderChart(res.cashflow);
    renderQuarterlyTable(res.cashflow);

    if (res.ai_analysis) {
      renderAI(res.ai_analysis);
    }
  } catch (e) {
    showToast('Ошибка соединения с сервером', 'error');
    console.error(e);
  } finally {
    showLoader(false);
  }
}

// ═══════════════════════════════════════════════════════
// AI ANALYSIS ON DEMAND
// ═══════════════════════════════════════════════════════
async function requestAIAnalysis() {
  if (!state.lastResults) { showToast('Сначала выполните расчёт', 'warning'); return; }
  const btn = document.getElementById('btnAIAnalysis');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Анализ...';

  try {
    // Отправляем пустой before чтобы получить анализ текущего состояния
    const res = await apiPost('/calculate', state.lastParams);
    if (res.ai_analysis) renderAI(res.ai_analysis);
    else showToast('AI-анализ недоступен (проверьте GEMINI_API_KEY)', 'warning');
  } catch (e) {
    showToast('Ошибка AI-анализа', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-robot"></i> AI-анализ';
  }
}

// ═══════════════════════════════════════════════════════
// RENDER RESULTS
// ═══════════════════════════════════════════════════════
function renderKPIs(r) {
  // NPV
  const npvEl = document.getElementById('kpiNPV');
  npvEl.textContent = fmtRub(r.npv);
  setKpiClass(npvEl, r.npv > 0 ? 'positive' : 'negative');

  // IRR
  const irrEl = document.getElementById('kpiIRR');
  irrEl.textContent = `${r.irr.toFixed(1)}%`;
  setKpiClass(irrEl, r.irr > 20 ? 'positive' : r.irr > 12 ? 'warning' : 'negative');

  // PI
  const piEl = document.getElementById('kpiPI');
  piEl.textContent = r.pi.toFixed(2);
  setKpiClass(piEl, r.pi >= 1.3 ? 'positive' : r.pi >= 1.0 ? 'warning' : 'negative');

  // Equity IRR
  const eirEl = document.getElementById('kpiEquityIRR');
  eirEl.textContent = `${r.equity_irr.toFixed(1)}%`;
  setKpiClass(eirEl, r.equity_irr > 25 ? 'positive' : r.equity_irr > 15 ? 'warning' : 'negative');

  // Payback
  const pbEl = document.getElementById('kpiPayback');
  if (r.payback > 0) {
    pbEl.textContent = `${r.payback} кв. (${(r.payback / 4).toFixed(1)} лет)`;
    setKpiClass(pbEl, r.payback <= 8 ? 'positive' : r.payback <= 12 ? 'warning' : 'negative');
  } else {
    pbEl.textContent = 'Не окупается';
    setKpiClass(pbEl, 'negative');
  }

  // DSCR
  const dscrEl = document.getElementById('kpiDSCR');
  dscrEl.textContent = r.dscr > 0 ? `${r.dscr.toFixed(2)}x` : '—';
  setKpiClass(dscrEl, r.dscr >= 1.5 ? 'positive' : r.dscr >= 1.2 ? 'warning' : 'negative');
}

function setKpiClass(el, cls) {
  el.classList.remove('positive', 'negative', 'warning');
  el.classList.add(cls);
}

function renderFinTable(r) {
  setText('finRevenue',     fmtRub(r.total_revenue));
  setText('finCAPEX',       fmtRub(r.total_capex));
  setText('finOPEX',        fmtRub(r.total_opex));
  setText('finTax',         fmtRub(r.total_tax));
  setText('finDebtService', fmtRub(r.total_debt_service));

  const net = r.net_profit;
  const netEl = document.getElementById('finNetProfit');
  netEl.textContent = fmtRub(net);
  netEl.className = 'fin-value ' + (net >= 0 ? 'td-pos' : 'td-neg');
}

// ═══════════════════════════════════════════════════════
// CHART
// ═══════════════════════════════════════════════════════
function renderChart(cf) {
  const ctx = document.getElementById('cashflowChart').getContext('2d');
  const labels = cf.quarters.map(q => `Q${q}`);

  if (state.chart) { state.chart.destroy(); state.chart = null; }

  state.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Выручка',
          data: cf.revenue,
          backgroundColor: 'rgba(72,187,120,.75)',
          borderColor: 'rgba(72,187,120,1)',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'CAPEX',
          data: cf.capex,
          backgroundColor: 'rgba(245,101,101,.7)',
          borderColor: 'rgba(245,101,101,1)',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'OPEX',
          data: cf.opex,
          backgroundColor: 'rgba(237,137,54,.65)',
          borderColor: 'rgba(237,137,54,1)',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'Налоги',
          data: cf.taxes,
          backgroundColor: 'rgba(160,174,192,.6)',
          borderColor: 'rgba(160,174,192,1)',
          borderWidth: 1,
          order: 2,
        },
        {
          label: 'ЧДП накопл.',
          data: cf.cumulative_cashflow,
          type: 'line',
          borderColor: 'rgba(66,153,225,1)',
          backgroundColor: 'rgba(66,153,225,.1)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(66,153,225,1)',
          fill: true,
          tension: 0.3,
          order: 1,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtRubShort(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#718096' },
        },
        y: {
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: {
            font: { size: 11 },
            color: '#718096',
            callback: v => fmtRubShort(v),
          },
        },
      },
    },
  });

  renderChartLegend();
}

function renderChartLegend() {
  const items = [
    { color: 'rgba(72,187,120,.75)', label: 'Выручка' },
    { color: 'rgba(245,101,101,.7)', label: 'CAPEX' },
    { color: 'rgba(237,137,54,.65)', label: 'OPEX' },
    { color: 'rgba(160,174,192,.6)', label: 'Налоги' },
    { color: 'rgba(66,153,225,1)',   label: 'ЧДП накопл.' },
  ];
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = items.map(i =>
    `<span class="chart-legend-item">
       <span class="legend-dot" style="background:${i.color}"></span>${i.label}
     </span>`
  ).join('');
}

// ═══════════════════════════════════════════════════════
// QUARTERLY TABLE
// ═══════════════════════════════════════════════════════
function renderQuarterlyTable(cf) {
  const tbody = document.getElementById('qTableBody');
  tbody.innerHTML = '';
  cf.quarters.forEach(q => {
    const rev  = cf.revenue[q];
    const cap  = cf.capex[q];
    const ope  = cf.opex[q];
    const tax  = cf.taxes[q];
    const ds   = cf.debt_service[q];
    const net  = cf.free_cashflow[q];
    const cum  = cf.cumulative_cashflow[q];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Q${q}</td>
      <td class="${rev > 0 ? 'td-pos' : ''}">${fmtRubShort(rev)}</td>
      <td class="${cap < 0 ? 'td-neg' : ''}">${fmtRubShort(cap)}</td>
      <td class="${ope < 0 ? 'td-neg' : ''}">${fmtRubShort(ope)}</td>
      <td class="${tax < 0 ? 'td-neg' : ''}">${fmtRubShort(tax)}</td>
      <td class="${ds < 0 ? 'td-neg' : ''}">${fmtRubShort(ds)}</td>
      <td class="${net >= 0 ? 'td-pos' : 'td-neg'}">${fmtRubShort(net)}</td>
      <td class="${cum >= 0 ? 'td-pos' : 'td-neg'}">${fmtRubShort(cum)}</td>`;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════
// AI RENDER
// ═══════════════════════════════════════════════════════
function renderAI(text) {
  const el = document.getElementById('aiContent');
  el.innerHTML = `<div class="ai-text">${escapeHtml(text)}</div>`;
}

// ═══════════════════════════════════════════════════════
// SAVE SCENARIO
// ═══════════════════════════════════════════════════════
async function saveScenario() {
  if (!state.lastResults) { showToast('Сначала выполните расчёт', 'warning'); return; }
  const name = document.getElementById('scenarioName').value.trim();
  if (!name) { showToast('Введите название сценария', 'warning'); return; }

  try {
    const res = await apiPost('/save', {
      name,
      params: state.lastParams,
      results: state.lastResults,
    });
    if (res.success) {
      showToast(`Сценарий «${name}» сохранён (ID: ${res.id})`, 'success');
      closeModal('modalSave');
      document.getElementById('scenarioName').value = '';
    } else {
      showToast(res.error || 'Ошибка сохранения', 'error');
    }
  } catch (e) {
    showToast('Ошибка соединения', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// LOAD SCENARIO LIST
// ═══════════════════════════════════════════════════════
async function loadScenarioList(containerId, mode) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<div class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
  try {
    const scenarios = await apiFetch('/scenarios');
    if (!scenarios.length) {
      container.innerHTML = '<div class="empty-msg"><i class="fas fa-inbox"></i><br/>Нет сохранённых сценариев</div>';
      return;
    }
    container.innerHTML = '';
    scenarios.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'scenario-item';
      item.dataset.id = sc.id;
      item.innerHTML = `
        <div>
          <div class="scenario-name">${escapeHtml(sc.name)}</div>
          <div class="scenario-date"><i class="fas fa-clock"></i> ${sc.created_at}</div>
        </div>
        <div class="scenario-actions">
          ${mode === 'load' ? `<button class="btn btn-primary btn-sm btn-load" data-id="${sc.id}"><i class="fas fa-download"></i> Загрузить</button>` : ''}
          ${mode === 'compare' ? `<button class="btn btn-outline btn-sm btn-compare-sel" data-id="${sc.id}" style="border-color:var(--c-border);color:var(--c-text)"><i class="fas fa-check"></i> Выбрать</button>` : ''}
          <button class="btn btn-danger btn-sm btn-del" data-id="${sc.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </div>`;
      container.appendChild(item);
    });

    // Load buttons
    container.querySelectorAll('.btn-load').forEach(btn => {
      btn.addEventListener('click', () => loadScenario(parseInt(btn.dataset.id)));
    });

    // Compare select buttons
    container.querySelectorAll('.btn-compare-sel').forEach(btn => {
      btn.addEventListener('click', () => toggleCompareSelection(parseInt(btn.dataset.id), btn));
    });

    // Delete buttons
    container.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteScenario(parseInt(btn.dataset.id), containerId, mode);
      });
    });

  } catch (e) {
    container.innerHTML = '<div class="empty-msg">Ошибка загрузки</div>';
  }
}

async function loadScenario(id) {
  try {
    const sc = await apiFetch(`/load/${id}`);
    applyParams(sc.params);
    state.lastResults  = sc.results;
    state.lastParams   = sc.params;
    showToast(`Сценарий «${sc.name}» загружен`, 'success');
    closeModal('modalLoad');
    calculate();
  } catch (e) {
    showToast('Ошибка загрузки сценария', 'error');
  }
}

async function deleteScenario(id, containerId, mode) {
  if (!confirm('Удалить сценарий?')) return;
  try {
    await apiFetch(`/scenarios/${id}`, 'DELETE');
    showToast('Сценарий удалён', 'info');
    loadScenarioList(containerId, mode);
  } catch (e) {
    showToast('Ошибка удаления', 'error');
  }
}

function applyParams(params) {
  const simpleFields = [
    'area','apartments','horizon','purchase_price','extra_costs',
    'reconstruction_price','reconstruction_period',
    'rent_monthly','rent_start_q','rent_end_q','opex_monthly',
    'sale_price','sale_start_q',
    'debt_ratio','interest_rate','loan_period','grace_period',
    'usn_rate','property_tax_rate','depreciation_rate','discount_rate',
  ];
  simpleFields.forEach(f => {
    const el = document.getElementById(f);
    if (el && params[f] !== undefined) el.value = params[f];
  });
  const usnEl = document.getElementById('usn_mode');
  if (usnEl && params.usn_mode) usnEl.value = params.usn_mode;

  // Rebuild schedules with loaded values then fill
  buildReconSchedule();
  buildOccupancySchedule();
  buildSaleSchedule();

  fillScheduleGrid('reconScheduleContainer', params.reconstruction_schedule || []);
  fillScheduleGrid('occupancyContainer', params.occupancy_schedule || []);
  fillScheduleGrid('saleScheduleContainer', params.sale_schedule || []);
  updateCalcValues();
}

function fillScheduleGrid(containerId, values) {
  const inputs = document.querySelectorAll(`#${containerId} input`);
  inputs.forEach((inp, i) => { if (values[i] !== undefined) inp.value = values[i]; });
}

// ═══════════════════════════════════════════════════════
// COMPARE
// ═══════════════════════════════════════════════════════
function toggleCompareSelection(id, btn) {
  const idx = state.compareSelected.indexOf(id);
  if (idx === -1) {
    if (state.compareSelected.length >= 3) {
      showToast('Максимум 3 сценария для сравнения', 'warning');
      return;
    }
    state.compareSelected.push(id);
    btn.style.background = 'var(--c-blue)';
    btn.style.color = '#fff';
  } else {
    state.compareSelected.splice(idx, 1);
    btn.style.background = '';
    btn.style.color = '';
  }
}

async function runCompare() {
  if (state.compareSelected.length < 2) {
    showToast('Выберите минимум 2 сценария', 'warning');
    return;
  }
  try {
    const scenarios = await apiPost('/compare', { ids: state.compareSelected });
    renderCompareTable(scenarios);
    state.compareSelected = [];
  } catch (e) {
    showToast('Ошибка сравнения', 'error');
  }
}

function renderCompareTable(scenarios) {
  const wrap = document.getElementById('compareTable');
  if (!scenarios.length) return;

  const metrics = [
    { key: 'npv',            label: 'NPV (₽)',               fmt: v => fmtRub(v),           higher: true  },
    { key: 'irr',            label: 'IRR (%)',                fmt: v => `${v.toFixed(1)}%`,  higher: true  },
    { key: 'equity_irr',     label: 'Equity IRR (%)',         fmt: v => `${v.toFixed(1)}%`,  higher: true  },
    { key: 'pi',             label: 'PI',                     fmt: v => v.toFixed(2),        higher: true  },
    { key: 'payback',        label: 'Окупаемость (кв.)',      fmt: v => v > 0 ? `${v} кв.` : 'Нет', higher: false },
    { key: 'dscr',           label: 'Мин. DSCR',              fmt: v => `${v.toFixed(2)}x`,  higher: true  },
    { key: 'total_revenue',  label: 'Выручка (₽)',            fmt: v => fmtRub(v),           higher: true  },
    { key: 'total_capex',    label: 'CAPEX (₽)',              fmt: v => fmtRub(v),           higher: false },
    { key: 'total_tax',      label: 'Налоги (₽)',             fmt: v => fmtRub(v),           higher: false },
    { key: 'net_profit',     label: 'ЧДП итого (₽)',          fmt: v => fmtRub(v),           higher: true  },
  ];

  const headers = scenarios.map(s => `<th>${escapeHtml(s.name)}</th>`).join('');
  const rows = metrics.map(m => {
    const vals = scenarios.map(s => s.results[m.key]);
    const best = m.higher ? Math.max(...vals) : Math.min(...vals.filter(v => v > 0));
    const cells = vals.map(v => {
      const isBest = v === best;
      const isWorst = !isBest && (m.higher ? v === Math.min(...vals) : v === Math.max(...vals));
      return `<td class="${isBest ? 'compare-best' : isWorst ? 'compare-worst' : ''}">${m.fmt(v)}</td>`;
    }).join('');
    return `<tr><td>${m.label}</td>${cells}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Показатель</th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  wrap.style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════
async function exportPDF() {
  if (!state.lastResults) { showToast('Сначала выполните расчёт', 'warning'); return; }
  showToast('Подготовка PDF...', 'info');

  try {
    const { jsPDF } = window.jspdf;
    const panel = document.getElementById('resultsPanel');

    const canvas = await html2canvas(panel, { scale: 1.5, useCORS: true, backgroundColor: '#F7FAFC' });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const imgW = pageW - 10;
    const imgH = (canvas.height * imgW) / canvas.width;
    let yPos = 5;
    let remaining = imgH;

    while (remaining > 0) {
      const sliceH = Math.min(remaining, pageH - 10);
      pdf.addImage(imgData, 'JPEG', 5, yPos, imgW, imgH);
      remaining -= (pageH - 10);
      if (remaining > 0) { pdf.addPage(); yPos = -(imgH - remaining) + 5; }
    }

    const today = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-');
    pdf.save(`finmodel_kazan_${today}.pdf`);
    showToast('PDF экспортирован', 'success');
  } catch (e) {
    console.error(e);
    showToast('Ошибка экспорта PDF', 'error');
  }
}

// ═══════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  state.compareSelected = [];
}

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${escapeHtml(msg)}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ═══════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════
function showLoader(show) {
  document.getElementById('pageLoader').style.display = show ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════
async function apiPost(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function apiFetch(url, method = 'GET') {
  const res = await fetch(url, { method });
  return res.json();
}

// ═══════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════
function fmtRub(v) {
  if (v === undefined || v === null || isNaN(v)) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(v);
}

function fmtRubShort(v) {
  if (v === undefined || v === null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} млрд ₽`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} млн ₽`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} тыс ₽`;
  return `${sign}${abs.toFixed(0)} ₽`;
}

function floatVal(id, fallback = 0) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = parseFloat(el.value);
  return isNaN(v) ? fallback : v;
}

function intVal(id, fallback = 0) {
  return Math.round(floatVal(id, fallback));
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function on(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
