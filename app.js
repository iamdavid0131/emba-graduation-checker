import {
  TRACKS, REQUIRED_COURSES, CORE_COURSES,
  SPECIALTY_COURSES, COMMON_COURSES, REMEDIAL_COURSES, RULES
} from "./data.js";
import { exportInfographic } from "./export.js";
import { initReviews } from "./reviews-ui.js";

// ── State ─────────────────────────────────────────────────────
let state = {
  track: null,
  required:  new Set(),
  core:      new Set(),
  specialty: new Set(),
  common:    new Set(),
  remedial:  new Set(),
  ethicsDone:    false,
  certSubmitted: false,
};

const STORAGE_KEY = "emba_graduation_progress";

function saveState() {
  const serializable = {
    track: state.track,
    required:  [...state.required],
    core:      [...state.core],
    specialty: [...state.specialty],
    common:    [...state.common],
    remedial:  [...state.remedial],
    ethicsDone:    state.ethicsDone,
    certSubmitted: state.certSubmitted,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    state.track         = d.track ?? null;
    state.required      = new Set(d.required  ?? []);
    state.core          = new Set(d.core      ?? []);
    state.specialty     = new Set(d.specialty ?? []);
    state.common        = new Set(d.common    ?? []);
    state.remedial      = new Set(d.remedial  ?? []);
    state.ethicsDone    = d.ethicsDone    ?? false;
    state.certSubmitted = d.certSubmitted ?? false;
  } catch {}
}

// ── Analysis ──────────────────────────────────────────────────
function analyze() {
  const track = state.track;

  const reqCreditsDone = REQUIRED_COURSES
    .filter(c => state.required.has(c.id))
    .reduce((s, c) => s + c.credits, 0);
  const nonThesisDone = REQUIRED_COURSES
    .filter(c => !["R05","R06"].includes(c.id) && state.required.has(c.id))
    .reduce((s, c) => s + c.credits, 0);

  // specCount：只計算「自己組別」的已修專業門數（用於畢業門檻判斷）
  const myTrackCourses = track ? (SPECIALTY_COURSES[track] || []) : [];
  const specCount = myTrackCourses.filter(c => state.specialty.has(c)).length;

  // electiveCount：核心 + 所有組別專業 + 共同，全部計入選修合計
  const coreCount    = state.core.size;
  const specAllCount = state.specialty.size;   // 所有已勾專業（不分組）
  const commonCount  = state.common.size;
  const electiveCount   = coreCount + specAllCount + commonCount;
  const electiveCredits = electiveCount * RULES.creditPerElective;

  const totalDone = reqCreditsDone + electiveCredits;
  const totalNeed = RULES.requiredCredits + RULES.electiveCredits;

  return {
    track,
    reqCreditsDone, reqCreditsNeed: RULES.requiredCredits,
    nonThesisDone,  nonThesisNeed:  RULES.nonThesisCredits,
    coreCount,      coreNeed: RULES.coreMin,
    specCount,      specNeed: RULES.specialtyMin,   // 自己組別門數
    specAllCount,                                   // 所有已勾專業門數
    commonCount,
    electiveCount,   electiveCountNeed: RULES.electiveCourses,
    electiveCredits, electiveCreditsNeed: RULES.electiveCredits,
    electiveGap: Math.max(0, RULES.electiveCourses - electiveCount),
    totalDone, totalNeed,
    ethicsDone:    state.ethicsDone,
    certSubmitted: state.certSubmitted,
    pct: Math.min(100, Math.round(totalDone / totalNeed * 100)),
  };
}

// ── Charts ────────────────────────────────────────────────────
let donutChart = null;
let barChart   = null;

function initCharts() {
  const donutCtx = document.getElementById("donut-chart").getContext("2d");
  donutChart = new Chart(donutCtx, {
    type: "doughnut",
    data: {
      labels: ["已修", "尚缺"],
      datasets: [{ data: [0, 48], backgroundColor: ["#6366f1","#e2e8f0"],
        borderWidth: 0, hoverOffset: 4 }],
    },
    options: {
      cutout: "74%",
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.raw} 學分` }
      }},
      animation: { duration: 600, easing: "easeOutQuart" },
    },
  });

  const barCtx = document.getElementById("bar-chart").getContext("2d");
  barChart = new Chart(barCtx, {
    type: "bar",
    data: {
      labels: ["必修學科", "碩士論文", "核心科目", "專業科目", "共同選修"],
      datasets: [
        { label: "已達成", data: [0,0,0,0,0], backgroundColor: "#6366f1", borderRadius: 6 },
        { label: "尚缺",   data: [6,6,4,3,0], backgroundColor: "#e2e8f0", borderRadius: 6 },
      ],
    },
    options: {
      indexAxis: "y",
      scales: {
        x: { stacked: true, display: false },
        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 12 } } },
      },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw} 門/學分` } }
      },
      animation: { duration: 600 },
    },
  });
}

function updateCharts(r) {
  // Donut
  donutChart.data.datasets[0].data = [r.totalDone, Math.max(0, r.totalNeed - r.totalDone)];
  donutChart.update();

  // Bar – values in "equivalent units" (門 for core/spec, 學分 for others)
  const nonThesisMax = 6, thesisMax = 6, coreMax = 4, specMax = 3;
  const commonDone = state.common.size;
  const commonMax  = RULES.electiveCourses - RULES.coreMin - RULES.specialtyMin;

  const done = [
    Math.min(r.nonThesisDone, nonThesisMax),
    Math.min(r.reqCreditsDone - r.nonThesisDone, thesisMax),
    Math.min(r.coreCount, coreMax),
    Math.min(r.specCount, specMax),
    Math.min(commonDone, commonMax),
  ];
  const need = [
    Math.max(0, nonThesisMax - done[0]),
    Math.max(0, thesisMax    - done[1]),
    Math.max(0, coreMax      - done[2]),
    Math.max(0, specMax      - done[3]),
    Math.max(0, commonMax    - done[4]),
  ];
  barChart.data.datasets[0].data = done;
  barChart.data.datasets[1].data = need;
  barChart.update();
}

// ── Render helpers ────────────────────────────────────────────
function pill(label, ok) {
  return `<span class="pill ${ok ? "pill-ok" : "pill-ng"}">${ok ? "✔" : "✘"} ${label}</span>`;
}

function progressBar(done, total, label, note = "", gap = null) {
  const pct   = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  const color = pct === 100 ? "var(--green)" : pct >= 50 ? "var(--indigo)" : "var(--red)";
  const gapHtml = (gap !== null && gap > 0)
    ? `<span class="prog-gap">還差 ${gap} 門</span>` : "";
  const noteHtml = note
    ? `<div class="prog-note">${note}</div>` : "";
  return `
    <div class="prog-row">
      <div class="prog-label">
        <span>${label}${gapHtml}</span><span>${done} / ${total}</span>
      </div>
      <div class="prog-track">
        <div class="prog-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      ${noteHtml}
    </div>`;
}

// ── Build Course Section ──────────────────────────────────────
function buildCourseSection(category, courses, stateSet, idPrefix) {
  return courses.map(name => {
    const id    = `${idPrefix}_${name}`;
    const checked = stateSet.has(name) ? "checked" : "";
    return `
      <label class="course-item ${stateSet.has(name) ? "is-done" : ""}" data-id="${id}">
        <input type="checkbox" id="${id}" data-cat="${category}" data-name="${name}" ${checked}>
        <span class="check-icon"></span>
        <span class="course-name">${name}</span>
      </label>`;
  }).join("");
}

function buildRequiredSection() {
  return REQUIRED_COURSES.map(c => {
    const checked = state.required.has(c.id) ? "checked" : "";
    return `
      <label class="course-item req-item ${state.required.has(c.id) ? "is-done" : ""}" data-id="req_${c.id}">
        <input type="checkbox" id="req_${c.id}" data-cat="required" data-cid="${c.id}" ${checked}>
        <span class="check-icon"></span>
        <span class="course-name">${c.name}</span>
        <span class="credit-badge">${c.credits} 學分</span>
      </label>`;
  }).join("");
}

// ── Recommendations ───────────────────────────────────────────
function buildRecommendations(r) {
  const track = r.track;
  if (!track) return "";
  const recs = [];

  if (r.specCount < r.specNeed) {
    SPECIALTY_COURSES[track].filter(c => !state.specialty.has(c))
      .slice(0, r.specNeed - r.specCount)
      .forEach(c => recs.push({ tag: `${track}組專業`, name: c, color: "var(--indigo)" }));
  }
  if (r.coreCount < r.coreNeed) {
    CORE_COURSES.filter(c => !state.core.has(c))
      .slice(0, r.coreNeed - r.coreCount)
      .forEach(c => recs.push({ tag: "核心", name: c, color: "var(--purple)" }));
  }
  const shortfall = Math.max(0, r.electiveCountNeed - r.electiveCount);
  if (shortfall > recs.length) {
    const extra = shortfall - recs.length;
    const pool = [
      ...SPECIALTY_COURSES[track].filter(c => !state.specialty.has(c)).map(c => ({ tag: `${track}組專業`, name: c, color: "var(--indigo)" })),
      ...CORE_COURSES.filter(c => !state.core.has(c)).map(c => ({ tag: "核心", name: c, color: "var(--purple)" })),
      ...COMMON_COURSES.filter(c => !state.common.has(c)).map(c => ({ tag: "共同", name: c, color: "var(--teal)" })),
    ];
    const seen = new Set(recs.map(r => r.name));
    pool.filter(p => !seen.has(p.name)).slice(0, extra).forEach(p => recs.push(p));
  }
  if (!recs.length) return `<p class="rec-empty">🎉 所有選修條件均已達成！</p>`;
  return recs.map(r =>
    `<div class="rec-card">
       <span class="rec-tag" style="background:${r.color}20;color:${r.color}">${r.tag}</span>
       <span class="rec-name">${r.name}</span>
       <span class="rec-credits">+3 學分</span>
     </div>`
  ).join("");
}

// ── Main Render ───────────────────────────────────────────────
function render() {
  const r = analyze();

  // ── Track selector
  document.querySelectorAll(".track-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.track === state.track);
  });

  // ── Stats cards
  const allReqDone  = r.reqCreditsDone  >= r.reqCreditsNeed;
  const allNTDone   = r.nonThesisDone   >= r.nonThesisNeed;
  const allCoreDone = r.coreCount       >= r.coreNeed;
  const allSpecDone = r.specCount       >= r.specNeed;
  const allElecCountDone   = r.electiveCount   >= r.electiveCountNeed;
  const allElecCreditsDone = r.electiveCredits >= r.electiveCreditsNeed;
  const allElecDone = allElecCountDone && allElecCreditsDone;

  document.getElementById("stat-total-done").textContent   = r.totalDone;
  document.getElementById("stat-total-need").textContent   = r.totalNeed;
  document.getElementById("stat-pct").textContent          = r.pct + "%";
  document.getElementById("stat-elec-done").textContent    = r.electiveCredits;
  document.getElementById("stat-elec-need").textContent    = r.electiveCreditsNeed;
  document.getElementById("stat-courses-done").textContent = r.electiveCount;
  document.getElementById("stat-courses-need").textContent = r.electiveCountNeed;

  // color cards
  document.getElementById("card-total").className  = "stat-card " + (r.pct === 100 ? "card-ok" : "card-neutral");
  document.getElementById("card-elec").className   = "stat-card " + (allElecDone  ? "card-ok" : "card-ng");
  document.getElementById("card-courses").className= "stat-card " + (allElecCountDone ? "card-ok" : "card-ng");

  // ── Progress bars
  const electiveNote = `核心 ${r.coreCount} 門 ＋ 專業 ${r.specAllCount} 門 ＋ 共同 ${r.commonCount} 門`;
  document.getElementById("prog-bars").innerHTML = [
    progressBar(r.nonThesisDone,   r.nonThesisNeed,          "必修學科"),
    progressBar(Math.min(r.reqCreditsDone - r.nonThesisDone, 6), 6, "碩士論文"),
    progressBar(r.coreCount,       r.coreNeed,               "核心科目（門）"),
    progressBar(r.specCount,       r.specNeed,               `${state.track ?? "?"}組專業（門）`),
    progressBar(r.electiveCount,   r.electiveCountNeed,      "選修合計（門）",
      electiveNote, r.electiveGap),
    progressBar(r.electiveCredits, r.electiveCreditsNeed,    "選修合計（學分）"),
  ].join("");

  // ── Checklist pills in summary
  document.getElementById("summary-pills").innerHTML = [
    pill("必修 12 學分",  allReqDone),
    pill("必修學科 6 學分", allNTDone),
    pill("碩士論文 ×2", state.required.has("R05") && state.required.has("R06")),
    pill("核心 ≥4 門",   allCoreDone),
    pill("專業 ≥3 門",   allSpecDone),
    pill("選修 36 學分", allElecCreditsDone),
    pill("選修 12 門",   allElecCountDone),
    pill("學術倫理",     r.ethicsDone),
    pill("修課證明",     r.certSubmitted),
  ].join("");

  // ── Donut centre text
  document.getElementById("donut-center").innerHTML =
    `<div class="donut-big">${r.totalDone}</div><div class="donut-sub">/ ${r.totalNeed} 學分</div>`;

  // ── Charts
  updateCharts(r);

  // ── Course checkboxes (style only, DOM already exists)
  document.querySelectorAll(".course-item input[type=checkbox]").forEach(cb => {
    cb.closest(".course-item").classList.toggle("is-done", cb.checked);
  });

  // ── Specialty group counters（每次 render 同步更新，避免計數顯示停滯）
  Object.entries(SPECIALTY_COURSES).forEach(([t, courses]) => {
    const badge = document.querySelector(`.spec-group[data-track="${t}"] .spec-count`);
    if (!badge) return;
    const done = courses.filter(c => state.specialty.has(c)).length;
    badge.textContent = `${done} / ${courses.length}`;
    badge.classList.toggle("spec-count-has", done > 0);
  });

  // ── Oral conditions
  document.getElementById("cb-ethics").checked   = state.ethicsDone;
  document.getElementById("cb-cert").checked     = state.certSubmitted;
}

// ── Event delegation ──────────────────────────────────────────
function onCourseChange(e) {
  const cb = e.target;
  if (cb.type !== "checkbox") return;
  const cat  = cb.dataset.cat;
  const name = cb.dataset.name;
  const cid  = cb.dataset.cid;

  if (cat === "required") {
    cb.checked ? state.required.add(cid) : state.required.delete(cid);
  } else if (cat === "core") {
    cb.checked ? state.core.add(name) : state.core.delete(name);
  } else if (cat === "specialty") {
    cb.checked ? state.specialty.add(name) : state.specialty.delete(name);
  } else if (cat === "common") {
    cb.checked ? state.common.add(name) : state.common.delete(name);
  } else if (cat === "remedial") {
    cb.checked ? state.remedial.add(name) : state.remedial.delete(name);
  } else if (cat === "ethics") {
    state.ethicsDone = cb.checked;
  } else if (cat === "cert") {
    state.certSubmitted = cb.checked;
  }
  saveState();
  render();
}

// ── Build static DOM ──────────────────────────────────────────
function buildDOM() {
  // Required
  document.getElementById("list-required").innerHTML = buildRequiredSection();

  // Core
  document.getElementById("list-core").innerHTML =
    buildCourseSection("core", CORE_COURSES, state.core, "core");

  // Specialty (per track, or blank)
  renderSpecialty();

  // Common
  document.getElementById("list-common").innerHTML =
    buildCourseSection("common", COMMON_COURSES, state.common, "common");

  // Remedial
  document.getElementById("list-remedial").innerHTML =
    buildCourseSection("remedial", REMEDIAL_COURSES, state.remedial, "remedial");
}

function renderSpecialty() {
  const track = state.track;
  const list  = document.getElementById("list-specialty");
  const note  = document.getElementById("specialty-note");

  note.textContent = track
    ? `您的組別：${track}組（需至少 ${RULES.specialtyMin} 門）　其他組別科目亦可選修計入總學分`
    : "所有組別的專業科目　請先選擇組別以標示畢業門檻";

  list.innerHTML = Object.entries(SPECIALTY_COURSES).map(([t, courses]) => {
    const isMyTrack = t === track;
    const doneCount = courses.filter(c => state.specialty.has(c)).length;
    return `
      <div class="spec-group ${isMyTrack ? "spec-my-track" : ""}" data-track="${t}">
        <div class="spec-group-header">
          <span class="spec-group-title">${t}組</span>
          ${isMyTrack ? `<span class="spec-my-badge">您的組別　需 ${RULES.specialtyMin} 門</span>` : ""}
          <span class="spec-count ${doneCount > 0 ? "spec-count-has" : ""}">${doneCount} / ${courses.length}</span>
        </div>
        <div class="course-list">
          ${buildCourseSection("specialty", courses, state.specialty, "spec")}
        </div>
      </div>`;
  }).join("");
}

// ── Track buttons ─────────────────────────────────────────────
function initTrackButtons() {
  document.getElementById("track-selector").addEventListener("click", e => {
    const btn = e.target.closest(".track-btn");
    if (!btn) return;
    state.track = btn.dataset.track;
    saveState();
    renderSpecialty();
    render();
  });
}

// ── Tabs ──────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("pane-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ── Export ────────────────────────────────────────────────────
function initExport() {
  document.getElementById("btn-export").addEventListener("click", () => {
    exportInfographic(state, analyze);
  });
}

// ── Reset ─────────────────────────────────────────────────────
function initReset() {
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("確定要清除所有進度？")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = { track: null, required: new Set(), core: new Set(),
      specialty: new Set(), common: new Set(), remedial: new Set(),
      ethicsDone: false, certSubmitted: false };
    buildDOM();
    render();
  });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  buildDOM();
  initCharts();
  initTrackButtons();
  initTabs();
  initExport();
  initReset();

  document.addEventListener("change", onCourseChange);
  render();
  initReviews();
});
