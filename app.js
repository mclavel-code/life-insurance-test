/* ============================================================================
   U.S. News — Life Insurance Hub (INS-912) · app.js
   ----------------------------------------------------------------------------
   Every behavior and formula here is ported 1:1 from the design prototype's
   component (`Life Insurance Hub v6.dc.html`, <script type="text/x-dc">).
   The page renders fully without this file; everything below is progressive
   enhancement on the markup that index.html already contains.

   CONTENTS
     1 · Data          rate tables, school costs, tooltip definitions (samples —
                       final figures come from the U.S. News ratings feed)
     2 · State         ported defaults, context persistence (localStorage)
     3 · Render        data-if / data-bind / data-text / data-dyn resolution
     4 · Actions       calculator math, tabs, FAQ, menu, compare, tooltips
     5 · Page effects  scroll spy, sticky bar, progress bar, reveal, hover
   ============================================================================ */
(function () {
  'use strict';

  /* ======================= 1 · DATA ======================================= */
  // Average monthly premium, $1M policy. Term: 20-year level, by health class.
  var COST_TERM = {
    Female: [
      { age: '35', vals: ['$35.95', '$54.50', '$117.72', '$109.27'] },
      { age: '45', vals: ['$76.57', '$120.50', '$273.20', '$382.43'] },
      { age: '55', vals: ['$184.08', '$283.15', '$623.20', '$807.84'] },
      { age: '65', vals: ['$605.84', '$873.45', '$1,549.68', '$1,853.66'] }
    ],
    Male: [
      { age: '35', vals: ['$43.49', '$70.89', '$155.79', '$204.16'] },
      { age: '45', vals: ['$101.10', '$155.80', '$372.31', '$495.30'] },
      { age: '55', vals: ['$250.54', '$417.99', '$897.33', '$1,155.48'] },
      { age: '65', vals: ['$851.18', '$1,348.82', '$2,066.19', '$2,392.07'] }
    ]
  };
  // Whole life: nonsmoker, average health.
  var COST_WHOLE = {
    Female: { 30: '$743.94', 40: '$1,112.53', 50: '$1,782.89', 60: '$2,996.64', 70: '$5,226.31' },
    Male:   { 30: '$881.61', 40: '$1,340.61', 50: '$2,138.06', 60: '$3,706.81', 70: '$6,387.28' }
  };
  // College Board 2022–23 totals (4yr unless noted) — drives the detailed calc.
  var SCHOOL_COST = { 26940: 26940, 93000: 93000, 162200: 162200, 213720: 213720 };

  var DEFINITIONS = {
    coverage:  { term: '10–12× your income', body: 'A common starting guideline: enough coverage to replace your income for 10 to 12 years. Adjust for debts, dependents and savings.' },
    cashvalue: { term: 'Cash value', body: 'A savings component inside permanent policies. It grows tax-deferred and you can borrow against it, though loans reduce the death benefit.' },
    noexam:    { term: 'No-exam', body: 'Underwriting that uses health records and questionnaires instead of a medical visit. Faster to approve; coverage amounts can be capped.' },
    naic:      { term: 'NAIC complaint record', body: 'The National Association of Insurance Commissioners tracks complaints filed against insurers. A lower index means fewer complaints than expected for the carrier’s size.' },
    term:      { term: 'Term life', body: 'Coverage for a set period, usually 10 to 30 years. Lowest premiums; no cash value; coverage ends when the term does.' }
  };

  var JUMP = [['types', 'Policy types'], ['calculator', 'Calculator'], ['costs', 'Costs'],
              ['ratings', 'Rankings & reviews'], ['guides', 'Guides'], ['faq', 'FAQs']];
  var KEY = 'usn-life-hub-context';

  /* ======================= 2 · STATE ====================================== */
  // Defaults ported verbatim from the prototype component's `state`.
  var S = {
    costTab: 'term', costGender: 'Female', menuOpen: false, openFaq: 0,
    sticky: false, stickyDismissed: false, tipOpen: null, ctx: null,
    calcMode: null,
    sIncome: '0', sEduOn: false, sKids: '', sResult: null,
    dGoalFamily: false, dGoalEdu: false, dGoalDebt: false,
    dGoalFuneral: false, dGoalCharity: false, dGoalOther: false,
    dMonthlyIncome: '0', dIncomeYears: '10', dIncomeInflOn: false, dIncomeInflRate: '2.5',
    dEduInflOn: false, dEduInflRate: '4.9', dSchoolType: '', dCustomEdu: '0',
    dNumChildren: '', dYearsUntilCollege: '',
    dDebt: '0', dFuneral: '8,300', dCharity: '0',
    dHealthcare: '0', dLoved: '0', dFuture: '0', dBonus: '0',
    dSavings: '0', dIndividual: '0', dGroup: '0', dOther: '0', dResult: null,
    cmpA: 0, cmpB: 1,
    allCarriers: false, openCarrier: null
  };

  /* ---- helpers ported verbatim ---- */
  function toIntC(v)  { return parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0; }
  function toFloatC(v){ return parseFloat(v) || 0; }
  function fmtC(n)    { return Number(n).toLocaleString('en-US'); }
  // Excel-style future value — the prototype's exact implementation.
  function fvC(rate, nper, pmt, pv, type) {
    type = type || 0;
    if (nper === 0) return -pv;
    if (rate === 0) return -(pv + pmt * nper);
    var l = Math.pow(1 + rate, nper);
    var u = pv * l + pmt * ((l - 1) / rate);
    return type === 1 ? -u * (1 + rate) : -u;
  }
  function loadContext()  { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function saveContext(p) { try { var n = Object.assign({}, loadContext() || {}, p, { ts: Date.now() }); localStorage.setItem(KEY, JSON.stringify(n)); return n; } catch (e) { return null; } }
  function remember(p)    { var c = saveContext(p); if (c) { S.ctx = c; } }
  function reduced()      { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  /* ======================= 3 · RENDER ===================================== */
// Write text without flattening the markup's interpolation <span> wrappers.
function setText(el, v) {
  if (!el || el.textContent === v) return;
  var t = el; while (t.children.length === 1 && t.children[0].tagName === 'SPAN') t = t.children[0];
  t.textContent = v;
}
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Derived values — ported from the component's renderVals().
  function derived() {
    return {
      showSimple:   S.calcMode === 'simple',
      showDetailed: S.calcMode === 'detailed',
      hasSResult:   S.sResult !== null,
      hasDResult:   S.dResult !== null,
      sEduOn:       S.sEduOn,
      isCustomSchool: S.dSchoolType === 'custom',
      dGoalFamily: S.dGoalFamily, dGoalEdu: S.dGoalEdu, dGoalDebt: S.dGoalDebt,
      dGoalFuneral: S.dGoalFuneral, dGoalCharity: S.dGoalCharity, dGoalOther: S.dGoalOther,
      dIncomeInflOn: S.dIncomeInflOn, dEduInflOn: S.dEduInflOn,
      anyGoalChecked: S.dGoalFamily || S.dGoalEdu || S.dGoalDebt || S.dGoalFuneral || S.dGoalCharity || S.dGoalOther,
      menuOpen: S.menuOpen,
      sticky: S.sticky,
      hasCtx: !!(S.ctx && S.ctx.coverage),
      isTermTab: S.costTab === 'term',
      isWholeTab: S.costTab === 'whole',
      simpleActiveBorder:   S.calcMode === 'simple'   ? '#1263D3' : 'transparent',
      detailedActiveBorder: S.calcMode === 'detailed' ? '#1263D3' : 'transparent',
      sResultLabel: S.sResult !== null ? '$' + fmtC(S.sResult) : '',
      sResultCopy:  S.sResult !== null ? 'Based on replacing your income for 10 years' + (S.sEduOn && toIntC(S.sKids) > 0 ? ' plus $100,000 of education costs per child' : '') + ', adjusted for inflation.' : '',
      dResultLabel: S.dResult !== null ? '$' + fmtC(S.dResult) : '',
      dResultCopy:  S.dResult !== null ? 'Based on the expenses and goals you selected, minus the assets you already have.' : '',
      dIncomeInflOut: toFloatC(S.dIncomeInflRate).toFixed(1) + '%',
      dEduInflOut:    toFloatC(S.dEduInflRate).toFixed(1) + '%'
    };
  }

  // Active/inactive styles for the cost toggles, read from the markup itself
  // at init (term+Female render active) — guarantees fidelity without
  // duplicating style strings here.
  var tabOn = null, tabOff = null;
  function captureTabStyles() {
    var groups = $$('#costs [role="group"] button');
    if (groups.length < 4) return;
    var on  = groups[0], off = groups[1];
    tabOn  = { background: on.style.background,  color: on.style.color,  boxShadow: on.style.boxShadow };
    tabOff = { background: off.style.background, color: off.style.color, boxShadow: off.style.boxShadow };
  }
  function styleTab(btn, active) {
    if (!tabOn) return;
    var s = active ? tabOn : tabOff;
    btn.style.background = s.background;
    btn.style.color = s.color;
    btn.style.boxShadow = s.boxShadow;
    btn.setAttribute('aria-pressed', String(active));
  }

  function render() {
    var d = derived();

    // data-if visibility
    $$('[data-if]').forEach(function (el) {
      var on = !!d[el.getAttribute('data-if')];
      if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
    });
    // bound input values / checkboxes (only sync when not focused)
    $$('[data-bind]').forEach(function (el) {
      var k = el.getAttribute('data-bind');
      if (document.activeElement !== el && k in S) el.value = S[k];
    });
    $$('[data-bind-checked]').forEach(function (el) {
      el.checked = !!S[el.getAttribute('data-bind-checked')];
    });
    // text bindings
    $$('[data-text]').forEach(function (el) {
      var k = el.getAttribute('data-text');
      if (k in d) el.textContent = d[k];
    });
    // dynamic style bindings (calc mode borders)
    $$('[data-dyn]').forEach(function (el) {
      var m = el.getAttribute('data-dyn').split(':');
      el.style[m[0]] = d[m[1]];
    });
    // school radios reflect state
    $$('input[name="schoolType"]').forEach(function (r) { r.checked = String(S.dSchoolType) === r.value; });

    renderCosts(d);
    renderFaq();
    renderJump();
    renderCompare();
  }

  /* ---- costs section: tabs, caption, table/card values ---- */
  var costCaption = null, termValueCells = null, termCardCells = null;
  function initCostsRefs() {
    costCaption = $$('#costs p').filter(function (p) {
      return /\$1 million policy, by health class|nonsmoker in average health/.test(p.textContent);
    })[0] || null;
    // desktop term grid: value spans follow each age rowheader, 4 per row
    termValueCells = $$('[data-termtable] [role="cell"]');
    // mobile cards: same values in card layout
    termCardCells = $$('[data-termcards] [role="cell"], [data-termcards] [data-costcell]').filter(function (el) {
      return /^\$/.test(el.textContent.trim());
    });
  }
  function renderCosts(d) {
    var g = S.costGender, people = g === 'Male' ? 'men' : 'women';
    var buttons = $$('#costs [role="group"] button');
    if (buttons.length >= 4) {
      styleTab(buttons[0], d.isTermTab);
      styleTab(buttons[1], d.isWholeTab);
      styleTab(buttons[2], g === 'Female');
      styleTab(buttons[3], g === 'Male');
    }
    if (costCaption) {
      setText(costCaption, d.isWholeTab
        ? 'Whole life, ' + people + ': $1 million policy, nonsmoker in average health.'
        : '20-year term, ' + people + ': $1 million policy, by health class and tobacco use.');
    }
    // term/whole visibility. Both live in one container; the term pieces carry
    // !important media rules, so they are switched off via [data-off] (see
    // styles.css) rather than inline display.
    var termTable = $('[data-termtable]'), termCards = $('[data-termcards]');
    var wholeWrap = $('[data-if="isWholeTab"]');
    [termTable, termCards].forEach(function (el) {
      if (!el) return;
      if (d.isTermTab) el.removeAttribute('data-off');
      else el.setAttribute('data-off', '');
    });
    if (wholeWrap && d.isWholeTab) {
      $$('[data-wprice]', wholeWrap).forEach(function (cell) {
        setText(cell, COST_WHOLE[g][cell.getAttribute('data-wprice')]);
      });
      var t = $('[data-wholetable]', wholeWrap);
      if (t) t.setAttribute('aria-label', 'Average monthly whole life rates for ' + people + ', $1 million policy');
    }
    // term values re-render on gender flip
    if (d.isTermTab) {
      var rows = COST_TERM[g], flat = [];
      rows.forEach(function (r) { r.vals.forEach(function (v) { flat.push(v); }); });
      if (termValueCells && termValueCells.length === flat.length) {
        termValueCells.forEach(function (c, i) { setText(c, flat[i]); });
      }
      if (termCardCells && termCardCells.length === flat.length) {
        termCardCells.forEach(function (c, i) { setText(c, flat[i]); });
      }
      var tt = $('[data-termtable]');
      if (tt) tt.setAttribute('aria-label', 'Average monthly 20-year term life rates for ' + people + ', $1 million policy');
    }
  }

  /* ---- FAQ accordion (max-height pattern, as rendered) ---- */
  function renderFaq() {
    $$('#faq [id^="faq-btn-"]').forEach(function (btn) {
      var i = parseInt(btn.getAttribute('data-idx'), 10);
      var open = S.openFaq === i;
      btn.setAttribute('aria-expanded', String(open));
      var sign = $('[aria-hidden="true"]', btn);
      if (sign) setText(sign, open ? '−' : '+');
      var panel = $('#faq-panel-' + i);
      if (panel) panel.style.maxHeight = open ? '360px' : '0px';
    });
  }

  /* ---- jump nav scroll-spy ---- */
  var activeJump = null;
  function renderJump() {
    $$('[data-jumpnav] a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var on = id === activeJump;
      a.setAttribute('aria-current', on ? 'location' : 'false');
      a.style.color = on ? '#0C489B' : '#515767';
      a.style.borderBottomColor = on ? '#0C489B' : 'transparent';
    });
  }

  /* ---- policy-type compare (mobile selects swap the visible columns) ---- */
  function renderCompare() {
    $$('[data-ptable] [data-pcol]').forEach(function (col, i) {
      col.setAttribute('data-cmp', i === S.cmpA ? 'a' : (i === S.cmpB ? 'b' : '0'));
    });
    var sels = $$('[data-cmpbar] select, select[aria-label^="First policy"], select[aria-label^="Second policy"]');
    if (sels[0]) sels[0].value = String(S.cmpA);
    if (sels[1]) sels[1].value = String(S.cmpB);
  }

  /* ======================= 4 · ACTIONS ==================================== */
  function scrollToCalc() {
    setTimeout(function () {
      var el = $('[data-calc-panel]:not([hidden]) , [data-if="showSimple"]:not([hidden]), [data-if="showDetailed"]:not([hidden])');
      if (!el) return;
      var top = el.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: top, behavior: reduced() ? 'auto' : 'smooth' });
    }, 60);
  }

  // Simple: replace 10 years of income at 3% inflation (+$100k per child).
  function calcSimple() {
    var income = toIntC(S.sIncome);
    var kids = (S.sEduOn && toIntC(S.sKids)) || 0;
    var a = income > 0 ? fvC(0.03, 10, -income, 0, 0) : 0;
    var r = kids > 0 ? fvC(0.03, 10, 0, -100000 * kids, 0) : 0;
    S.sResult = Math.max(Math.round(a + r), 0);
    remember({ coverage: '$' + fmtC(S.sResult), income: income });
  }

  // Detailed: FV of each goal minus existing assets (formulas verbatim).
  function calcDetailed() {
    var income = 0;
    if (S.dGoalFamily) {
      var rate = S.dIncomeInflOn ? toFloatC(S.dIncomeInflRate) / 100 / 12 : 0;
      var nper = 12 * toIntC(S.dIncomeYears);
      income = fvC(rate, nper, -toIntC(S.dMonthlyIncome), 0, 0);
    }
    var education = 0;
    if (S.dGoalEdu) {
      var kids = toIntC(S.dNumChildren);
      var isCustom = S.dSchoolType === 'custom';
      var preset = !isCustom && SCHOOL_COST[S.dSchoolType] ? SCHOOL_COST[S.dSchoolType] * kids : 0;
      var custom = isCustom ? toIntC(S.dCustomEdu) * kids : 0;
      var total = isCustom ? custom : preset;
      var eduRate = S.dEduInflOn ? toFloatC(S.dEduInflRate) / 100 : 0;
      education = fvC(eduRate, toIntC(S.dYearsUntilCollege), 0, -total, 1);
    }
    var debt = S.dGoalDebt ? toIntC(S.dDebt) : 0;
    var funeral = S.dGoalFuneral ? toIntC(S.dFuneral) : 0;
    var charitable = S.dGoalCharity ? toIntC(S.dCharity) : 0;
    var other = S.dGoalOther ? toIntC(S.dHealthcare) + toIntC(S.dLoved) + toIntC(S.dFuture) + toIntC(S.dBonus) : 0;
    var assets = toIntC(S.dSavings) + toIntC(S.dIndividual) + toIntC(S.dGroup) + toIntC(S.dOther);
    S.dResult = Math.max(Math.round(income + education + debt + funeral + charitable + other - assets), 0);
    remember({ coverage: '$' + fmtC(S.dResult), income: toIntC(S.dMonthlyIncome) * 12 });
  }

  // Input factories (currency fields reformat with thousands separators).
  function currency(k) { return function (e) { S[k] = fmtC(toIntC(e.target.value)); S.dResult = null; render(); }; }
  function digits(k)   { return function (e) { S[k] = e.target.value.replace(/[^0-9]/g, ''); S.dResult = null; render(); }; }
  function toggle(k)   { return function (e) { S[k] = e.target.checked; S.dResult = null; render(); }; }

  var ACTIONS = {
    selectSimple:   function () { S.calcMode = 'simple';   render(); scrollToCalc(); },
    selectDetailed: function () { S.calcMode = 'detailed'; render(); scrollToCalc(); },
    calcSimple:     function () { calcSimple(); render(); },
    calcDetailed:   function () { calcDetailed(); render(); },
    onSIncome: currency('sIncome'), onSKids: digits('sKids'), onSEduToggle: toggle('sEduOn'),
    onDMonthlyIncome: currency('dMonthlyIncome'), onDIncomeYears: digits('dIncomeYears'),
    onDIncomeInflOn: toggle('dIncomeInflOn'),
    onDIncomeInflRate: function (e) { S.dIncomeInflRate = e.target.value; S.dResult = null; render(); },
    onDEduInflOn: toggle('dEduInflOn'),
    onDEduInflRate: function (e) { S.dEduInflRate = e.target.value; S.dResult = null; render(); },
    onSchoolType: function (e) { S.dSchoolType = e.target.value; S.dResult = null; render(); },
    onDCustomEdu: currency('dCustomEdu'), onDNumChildren: digits('dNumChildren'),
    onDYearsUntilCollege: digits('dYearsUntilCollege'),
    onDGoalFamily: toggle('dGoalFamily'), onDGoalEdu: toggle('dGoalEdu'),
    onDGoalDebt: toggle('dGoalDebt'), onDGoalFuneral: toggle('dGoalFuneral'),
    onDGoalCharity: toggle('dGoalCharity'), onDGoalOther: toggle('dGoalOther'),
    onDDebt: currency('dDebt'), onDFuneral: currency('dFuneral'), onDCharity: currency('dCharity'),
    onDHealthcare: currency('dHealthcare'), onDLoved: currency('dLoved'),
    onDFuture: currency('dFuture'), onDBonus: currency('dBonus'),
    onDSavings: currency('dSavings'), onDIndividual: currency('dIndividual'),
    onDGroup: currency('dGroup'), onDOther: currency('dOther'),
    dismissSticky: function () { S.stickyDismissed = true; S.sticky = false; render(); }
  };

/* ---- company directory ---------------------------------------------------
   Two captured variants share one state:
     desktop  [data-dirvariant="desktop"]  3 nodes: link list · toggle · trust
     mobile   [data-dirvariant="mobile"]   2 nodes: accordion+toggle · trust
   matchMedia(640px) decides which set is shown; "Show all 11 companies"
   expands either (6 rows default on desktop, 5 on mobile). Mobile rows
   open an inline panel cloned from #carrier-panel-tpl.                  */
var DIR = { desktop: null, mobile: null, mq: null };

function initDirectory() {
  ['desktop', 'mobile'].forEach(function (kind) {
    var nodes = $$('[data-dirvariant="' + kind + '"]');
    if (!nodes.length) return;
    var host = null, btns = [];
    nodes.forEach(function (n) {
      if (!host) host = (n.matches && n.matches('[data-dirlist],[data-dirmobile]')) ? n
                      : n.querySelector('[data-dirlist],[data-dirmobile]');
      if (n.tagName === 'BUTTON') btns.push(n);
      btns = btns.concat($$('button', n));
    });
    var rows = host
      ? $$(':scope > *', host).filter(function (r) {
          return kind === 'desktop' ? !!r.querySelector('img')
                                    : !!r.querySelector('button[data-idx]');
        })
      : [];
    var v = { kind: kind, nodes: nodes, rows: rows,
              limit: kind === 'desktop' ? 6 : 5,
              toggle: btns.filter(function (b) { return /Show (all|fewer)/.test(b.textContent); })[0] };
    DIR[kind] = v;
    if (v.toggle) v.toggle.addEventListener('click', function () {
      S.allCarriers = !S.allCarriers;
      renderDirectory();
    });
    if (kind === 'mobile') rows.forEach(function (row) {
      var btn = row.querySelector('button[data-idx]');
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        S.openCarrier = S.openCarrier === idx ? null : idx;
        renderDirectory();
      });
    });
  });
  DIR.mq = window.matchMedia('(max-width: 640px)');
  var onMq = function () { renderDirectory(); };
  if (DIR.mq.addEventListener) DIR.mq.addEventListener('change', onMq);
  else DIR.mq.addListener(onMq);
  // Also drive the swap from resize: some embedded/preview browsers never
  // deliver the media-query change event, which would otherwise leave the
  // wrong variant on screen after a viewport change.
  window.addEventListener('resize', onMq);
  renderDirectory();
}

function renderDirectory() {
  var mobile = DIR.mq && DIR.mq.matches;
  ['desktop', 'mobile'].forEach(function (kind) {
    var v = DIR[kind];
    if (!v) return;
    var active = (kind === 'mobile') === mobile;
    v.nodes.forEach(function (n) {
      if (active) n.removeAttribute('hidden'); else n.setAttribute('hidden', '');
    });
    v.rows.forEach(function (row, i) {
      row.style.display = (S.allCarriers || i < v.limit) ? '' : 'none';
      if (kind !== 'mobile') return;
      var btn = row.querySelector('button[data-idx]');
      var open = S.openCarrier === i;
      btn.setAttribute('aria-expanded', String(open));
      btn.style.background = open ? 'rgb(245, 249, 255)' : 'rgb(255, 255, 255)';
      var chevBox = btn.querySelector('svg') && btn.querySelector('svg').parentElement;
      if (chevBox) chevBox.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
      var panel = row.querySelector('[id^="carrier-panel-"]');
      if (open && !panel) row.appendChild(buildPanel(row, i));
      else if (!open && panel) panel.remove();
    });
    if (v.toggle) {
      setText(v.toggle, S.allCarriers ? 'Show fewer companies'
                                      : 'Show all ' + v.rows.length + ' companies');
      v.toggle.setAttribute('aria-expanded', String(S.allCarriers));
    }
  });
}

// Accordion panel, cloned from the captured template; texts/links swapped.
function buildPanel(row, i) {
  var tpl = document.getElementById('carrier-panel-tpl');
  var el = tpl.content.firstElementChild.cloneNode(true);
  var btn = row.querySelector('button[data-idx]');
  var spans = btn.querySelectorAll('span span');
  var name = spans[0] ? spans[0].textContent.trim() : '';
  var best = spans[1] ? spans[1].textContent.replace(/^Best for\s*/i, '').trim() : '';
  var rating = (btn.textContent.match(/(\d\.\d)/) || [,''])[1];
  el.id = 'carrier-panel-' + i;
  btn.setAttribute('aria-controls', el.id);
  var strongEl = el.querySelector('strong');
  if (strongEl) strongEl.textContent = best;
  var a = el.querySelector('a');
  var slug = { 'New York Life': 'new-york-life', 'Northwestern Mutual': 'northwestern-mutual',
    'USAA': 'usaa', 'MassMutual': 'massmutual', 'Nationwide': 'nationwide',
    'Mutual of Omaha': 'mutual-of-omaha', 'Guardian': 'guardian', 'State Farm': 'state-farm',
    'Pacific Life': 'pacific-life', 'Protective': 'protective', 'Ethos': 'ethos-review' }[name];
  if (slug) a.setAttribute('href', 'https://www.usnews.com/insurance/life-insurance/' + slug);
  a.setAttribute('aria-label', 'Read our ' + name + ' life insurance review. Rated ' + rating + ' out of 5');
  a.setAttribute('data-analytics', 'D|directory-m|' + (i + 1) + '|' + name);
  return el;
}

  /* ======================= 5 · PAGE EFFECTS =============================== */
  // Generic hover/focus engine — replays the prototype runtime's inline-style
  // swaps. data-hov / data-foc carry the exact CSS the design specified.
  function fxEngine() {
    function parse(css) {
      var out = [];
      css.split(';').forEach(function (d) {
        var i = d.indexOf(':'); if (i < 0) return;
        out.push([d.slice(0, i).trim(), d.slice(i + 1).trim()]);
      });
      return out;
    }
    $$('[data-hov], [data-foc]').forEach(function (el) {
      ['hov', 'foc'].forEach(function (kind) {
        var css = el.getAttribute('data-' + kind);
        if (!css) return;
        var decls = parse(css), saved = null;
        var onEvt  = kind === 'hov' ? 'mouseenter' : 'focus';
        var offEvt = kind === 'hov' ? 'mouseleave' : 'blur';
        el.addEventListener(onEvt, function () {
          saved = decls.map(function (d) { return [d[0], el.style.getPropertyValue(d[0])]; });
          decls.forEach(function (d) { el.style.setProperty(d[0], d[1]); });
        });
        el.addEventListener(offEvt, function () {
          (saved || []).forEach(function (d) { el.style.setProperty(d[0], d[1]); });
        });
      });
    });
  }

  // Reveal-on-scroll (ported initFx — honors prefers-reduced-motion).
  function initFx() {
    if (reduced()) return;
    var els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'none'; io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    els.forEach(function (el) {
      var sibs = el.parentNode ? Array.prototype.slice.call(el.parentNode.children).filter(function (c) { return c.hasAttribute && c.hasAttribute('data-reveal'); }) : [el];
      var i = Math.max(0, sibs.indexOf(el));
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 480ms ease-out ' + (i * 60) + 'ms, transform 480ms ease-out ' + (i * 60) + 'ms';
      io.observe(el);
    });
  }

  // Methodology weight bars grow into view (ported initBars).
  function initBars() {
    var bars = $$('[data-bar]');
    if (reduced() || !('IntersectionObserver' in window)) {
      bars.forEach(function (b) { b.style.transition = 'none'; b.style.width = b.dataset.w + '%'; });
      return;
    }
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.style.width = e.target.dataset.w + '%'; io.unobserve(e.target); } });
    }, { threshold: 0.4 });
    bars.forEach(function (b) { io.observe(b); });
  }

  // Sticky quote bar: desktop past 60% scroll, hidden near footer (ported).
  function updateSticky() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var wide = window.innerWidth > 760;
    var scrolled = wide
      ? (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight > 0.6
      : window.scrollY > hero.offsetTop + hero.offsetHeight;
    var nearFooter = (document.documentElement.scrollHeight - window.scrollY - window.innerHeight) < 600;
    var v = wide && scrolled && !nearFooter && !S.stickyDismissed;
    if (v !== S.sticky) { S.sticky = v; render(); }
  }

  // Red scroll-progress bar in the masthead (ported).
  function scrollProgress() {
    var bar = $('[data-scrollbar]');
    if (!bar) return;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0) + '%';
  }

  // Scroll spy for the jump nav (ported: active = last section above 120px).
  function scrollSpy() {
    var cur = null;
    JUMP.forEach(function (j) {
      var el = document.getElementById(j[0]);
      if (el && el.getBoundingClientRect().top < 120) cur = j[0];
    });
    if (cur !== activeJump) { activeJump = cur; renderJump(); }
  }

  // Tooltip definitions (ported HubShared.tooltip, DOM instead of React).
  function initTooltips() {
    $$('button[aria-label^="What does"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var existing = $('[data-tippanel]');
        if (existing) { existing.remove(); return; }
        var label = btn.getAttribute('aria-label') || '';
        var key = Object.keys(DEFINITIONS).filter(function (k) {
          return label.indexOf(DEFINITIONS[k].term) !== -1;
        })[0];
        if (!key) return;
        var d = DEFINITIONS[key];
        var tip = document.createElement('span');
        tip.setAttribute('data-tippanel', '1');
        tip.setAttribute('role', 'note');
        tip.style.cssText = 'position:absolute;z-index:1000;left:50%;transform:translateX(-50%);bottom:calc(100% + 8px);width:240px;background:#1A1D26;color:#fff;border-radius:8px;padding:12px 14px;font-size:12.5px;line-height:1.5;text-align:left;box-shadow:0 8px 24px rgba(8,19,36,0.25)';
        tip.innerHTML = '<strong style="display:block;margin-bottom:4px">' + d.term + '</strong>' + d.body;
        var host = btn.parentElement;
        host.style.position = 'relative';
        host.appendChild(tip);
        btn.setAttribute('aria-expanded', 'true');
      });
    });
    document.addEventListener('click', function (e) {
      var t = $('[data-tippanel]');
      if (t && !e.target.closest('[role="note"]')) t.remove();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var t = $('[data-tippanel]'); if (t) t.remove(); }
    });
  }

  /* ======================= INIT ========================================== */
  function init() {
    S.ctx = loadContext();
    captureTabStyles();
    initCostsRefs();
    initDirectory();

    // delegate all data-action hooks
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (!el || el.getAttribute('data-on') === 'change') return;
      var fn = ACTIONS[el.getAttribute('data-action')];
      if (fn) { fn(e); }
    });
    document.addEventListener('change', function (e) {
      var el = e.target.closest('[data-action][data-on="change"]');
      if (!el) return;
      var fn = ACTIONS[el.getAttribute('data-action')];
      if (fn) fn({ target: el });
    });
    // range inputs feel live
    document.addEventListener('input', function (e) {
      var el = e.target.closest('input[type="range"][data-action]');
      if (!el) return;
      var fn = ACTIONS[el.getAttribute('data-action')];
      if (fn) fn({ target: el });
    });

// calculator mode buttons live in the snapshot markup (no data-action);
// wire them via their stable analytics ids.
var simpleBtn = $('[data-analytics="D|estimator|1|Simple calculator"]');
var fullBtn   = $('[data-analytics="D|estimator|2|Full calculator"]');
if (simpleBtn) simpleBtn.addEventListener('click', ACTIONS.selectSimple);
if (fullBtn)   fullBtn.addEventListener('click', ACTIONS.selectDetailed);

    // cost toggles (rendered markup has no data-action; wire by position)
    var tabs = $$('#costs [role="group"] button');
    if (tabs.length >= 4) {
      tabs[0].addEventListener('click', function () { S.costTab = 'term';  render(); });
      tabs[1].addEventListener('click', function () { S.costTab = 'whole'; render(); });
      tabs[2].addEventListener('click', function () { S.costGender = 'Female'; render(); });
      tabs[3].addEventListener('click', function () { S.costGender = 'Male';   render(); });
    }
    // FAQ buttons
    $$('#faq [id^="faq-btn-"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        S.openFaq = S.openFaq === i ? null : i;
        renderFaq();
      });
    });
    // mobile burger
    var burger = $('[data-burger]') || $('button[aria-label="Menu"], button[aria-label="Open menu"]');
    if (burger) burger.addEventListener('click', function () { S.menuOpen = !S.menuOpen; render(); });
    // compare selects
    var sels = $$('select[aria-label^="First policy"], select[aria-label^="Second policy"]');
    if (sels[0]) sels[0].addEventListener('change', function () {
      var v = parseInt(sels[0].value, 10);
      if (v === S.cmpB) S.cmpB = S.cmpA;
      S.cmpA = v; render();
    });
    if (sels[1]) sels[1].addEventListener('change', function () {
      var v = parseInt(sels[1].value, 10);
      if (v === S.cmpA) S.cmpA = S.cmpB;
      S.cmpB = v; render();
    });

    // scroll-driven effects
    var onScroll = function () { scrollProgress(); scrollSpy(); updateSticky(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    fxEngine();
    initTooltips();
    setTimeout(function () { initFx(); initBars(); }, 120);

    render();
    onScroll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
