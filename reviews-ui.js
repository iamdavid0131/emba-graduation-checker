import {
  REQUIRED_COURSES, CORE_COURSES,
  SPECIALTY_COURSES, COMMON_COURSES, COURSE_INSTRUCTORS,
} from './data.js';
import { fetchAllReviews, submitReview } from './reviews.js';

// ── 課程分組 ──────────────────────────────────────────────────
const GROUPS = [
  { label: '必修科目',  courses: REQUIRED_COURSES.map(c => c.name) },
  { label: '核心科目',  courses: CORE_COURSES },
  ...Object.entries(SPECIALTY_COURSES).map(([t, cs]) => ({
    label: `${t}組專業`, courses: cs,
  })),
  { label: '共同選修',  courses: COMMON_COURSES },
];

// ── 狀態 ──────────────────────────────────────────────────────
let _reviews  = [];
let _expanded = null;
let _loading  = true;
let _query    = '';

// ── 工具 ──────────────────────────────────────────────────────
function overallStats(name) {
  const rs = _reviews.filter(r => r.course_name === name);
  if (!rs.length) return { avg: 0, count: 0 };
  return {
    avg:   rs.reduce((s, r) => s + r.rating, 0) / rs.length,
    count: rs.length,
  };
}

function instructorStats(name, instructor) {
  const rs = _reviews.filter(r => r.course_name === name && r.instructor === instructor);
  if (!rs.length) return { avg: 0, count: 0 };
  return {
    avg:   rs.reduce((s, r) => s + r.rating, 0) / rs.length,
    count: rs.length,
  };
}

function timeAgo(ts) {
  const m = Math.max(1, Math.floor((Date.now() - new Date(ts)) / 60000));
  if (m < 60)  return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} 小時前`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d} 天前`;
  return `${Math.floor(d / 30)} 個月前`;
}

function stars(n, color = false) {
  const filled = '★'.repeat(Math.round(n));
  const empty  = '☆'.repeat(5 - Math.round(n));
  return color
    ? `<span style="color:#f59e0b">${filled}</span>${empty}`
    : filled + empty;
}

// ── HTML 片段 ─────────────────────────────────────────────────
function reviewItemHtml(r) {
  return `
    <div class="rv-item">
      <div class="rv-item-top">
        <span class="rv-nick">${r.nickname}</span>
        <span class="rv-item-stars" style="color:#f59e0b">${'★'.repeat(r.rating)}<span style="color:#cbd5e1">${'★'.repeat(5 - r.rating)}</span></span>
        <span class="rv-ago">${timeAgo(r.created_at)}</span>
      </div>
      ${r.comment ? `<p class="rv-txt">${r.comment}</p>` : ''}
    </div>`;
}

function instructorSectionHtml(courseName, instructor) {
  const rs = _reviews.filter(r => r.course_name === courseName && r.instructor === instructor);
  const { avg, count } = instructorStats(courseName, instructor);
  return `
    <div class="rv-instr-section">
      <div class="rv-instr-head">
        <span class="rv-instr-name">👤 ${instructor}</span>
        <span class="rv-instr-meta">
          ${count
            ? `<span style="color:#f59e0b">${'★'.repeat(Math.round(avg))}<span style="color:#cbd5e1">${'★'.repeat(5 - Math.round(avg))}</span></span>
               <b class="rv-avg">${avg.toFixed(1)}</b>
               <span class="rv-cnt">${count} 則</span>`
            : `<span class="rv-no-rv">尚無評價</span>`
          }
        </span>
      </div>
      ${rs.length ? `<div class="rv-instr-reviews">${rs.map(reviewItemHtml).join('')}</div>` : ''}
    </div>`;
}

function panelHtml(name) {
  // 已知教師清單
  const knownInstructors = COURSE_INSTRUCTORS[name] || [];

  // 已有評價但不在已知清單的教師
  const reviewInstructors = [
    ...new Set(
      _reviews
        .filter(r => r.course_name === name && r.instructor)
        .map(r => r.instructor)
    ),
  ];
  const allInstructors = [...new Set([...knownInstructors, ...reviewInstructors])];

  // 沒有填教師的舊評價
  const unknownReviews = _reviews.filter(r => r.course_name === name && !r.instructor);

  // 表單：教師欄（已知→下拉；未知→文字輸入）
  const instrFormField = allInstructors.length
    ? `<select class="rv-instr-sel" data-course="${name}">
         <option value="">選擇任課教師 *</option>
         ${allInstructors.map(i => `<option value="${i}">${i}</option>`).join('')}
       </select>`
    : `<input class="rv-instr-in" data-course="${name}" placeholder="任課教師（必填）" maxlength="20">`;

  return `
    <div class="rv-panel">

      <div class="rv-instructors">
        ${allInstructors.length
          ? allInstructors.map(i => instructorSectionHtml(name, i)).join('')
          : `<p class="rv-empty" style="padding:.9rem 1rem">尚無評價，成為第一個！</p>`
        }
        ${unknownReviews.length ? `
          <div class="rv-instr-section rv-instr-legacy">
            <div class="rv-instr-head">
              <span class="rv-instr-name">📝 早期評價</span>
            </div>
            <div class="rv-instr-reviews">${unknownReviews.map(reviewItemHtml).join('')}</div>
          </div>` : ''
        }
      </div>

      <div class="rv-form">
        <div class="rv-form-title">留下評價</div>
        <div class="rv-form-row">
          <input class="rv-nick-in" data-course="${name}" placeholder="暱稱（如：114財金）" maxlength="20">
          ${instrFormField}
        </div>
        <div class="rv-star-row" data-course="${name}" data-v="0">
          ${[1,2,3,4,5].map(i => `<span class="rv-s" data-v="${i}">★</span>`).join('')}
        </div>
        <textarea class="rv-comment-in" data-course="${name}" placeholder="分享上課心得（選填）…" maxlength="200" rows="2"></textarea>
        <button class="rv-submit-btn" data-course="${name}">送出評價</button>
      </div>
    </div>`;
}

function highlight(name) {
  if (!_query) return name;
  const re = new RegExp(`(${_query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return name.replace(re, '<mark class="rv-hl">$1</mark>');
}

function courseHtml(name) {
  const { avg, count } = overallStats(name);
  const open = _expanded === name;
  const metaHtml = count
    ? `${stars(avg, true)}<b class="rv-avg">${avg.toFixed(1)}</b><span class="rv-cnt">${count} 則</span>`
    : `<span class="rv-no-rv">尚無評價</span>`;
  return `
    <div class="rv-course ${open ? 'rv-open' : ''}" data-name="${name}">
      <div class="rv-course-row">
        <span class="rv-cname">${highlight(name)}</span>
        <span class="rv-meta">${metaHtml}</span>
        <span class="rv-chevron">${open ? '▲' : '▼'}</span>
      </div>
      ${open ? panelHtml(name) : ''}
    </div>`;
}

// ── 主渲染 ────────────────────────────────────────────────────
function render() {
  const el = document.getElementById('rv-container');
  if (!el) return;

  if (_loading) {
    el.innerHTML = '<div class="rv-loading">⏳ 載入評價中…</div>';
    return;
  }

  const q = _query.toLowerCase();
  const filtered = GROUPS.map(g => ({
    ...g,
    courses: q ? g.courses.filter(c => c.toLowerCase().includes(q)) : g.courses,
  })).filter(g => g.courses.length);

  if (q && !filtered.length) {
    el.innerHTML = `<p class="rv-empty" style="padding:2rem;text-align:center">找不到「${_query}」相關課程</p>`;
    return;
  }

  el.innerHTML = filtered.map(g => `
    <div class="rv-group">
      <h3 class="rv-group-title">${g.label}</h3>
      ${g.courses.map(courseHtml).join('')}
    </div>`).join('');

  bindEvents();
}

// ── 事件綁定 ──────────────────────────────────────────────────
function bindEvents() {
  // 展開 / 收合
  document.querySelectorAll('.rv-course-row').forEach(row => {
    row.addEventListener('click', () => {
      const name = row.closest('.rv-course').dataset.name;
      _expanded = _expanded === name ? null : name;
      render();
    });
  });

  // 星等選取
  document.querySelectorAll('.rv-star-row').forEach(row => {
    const highlight = v =>
      row.querySelectorAll('.rv-s').forEach((s, i) =>
        s.classList.toggle('active', i < v));

    row.querySelectorAll('.rv-s').forEach(s => {
      s.addEventListener('mouseenter', () => highlight(+s.dataset.v));
      s.addEventListener('mouseleave', () => highlight(+row.dataset.v));
      s.addEventListener('click', e => {
        e.stopPropagation();
        row.dataset.v = s.dataset.v;
        highlight(+s.dataset.v);
      });
    });
  });

  // 送出評價
  document.querySelectorAll('.rv-submit-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const name = btn.dataset.course;

      const nickEl    = document.querySelector(`.rv-nick-in[data-course="${name}"]`);
      const starRow   = document.querySelector(`.rv-star-row[data-course="${name}"]`);
      const commentEl = document.querySelector(`.rv-comment-in[data-course="${name}"]`);
      const instrSel  = document.querySelector(`.rv-instr-sel[data-course="${name}"]`);
      const instrIn   = document.querySelector(`.rv-instr-in[data-course="${name}"]`);

      const nickname   = nickEl?.value.trim() || '匿名';
      const rating     = starRow ? +starRow.dataset.v : 0;
      const comment    = commentEl?.value.trim() || '';
      const instructor = (instrSel?.value || instrIn?.value || '').trim();

      if (!rating)     { alert('請先選擇星等！'); return; }
      if (!instructor) { alert('請選擇任課教師！'); return; }

      btn.disabled    = true;
      btn.textContent = '送出中…';

      const ok = await submitReview({ course_name: name, nickname, rating, comment, instructor });
      if (ok) {
        _reviews = await fetchAllReviews();
        render();
      } else {
        btn.disabled    = false;
        btn.textContent = '送出評價';
        alert('送出失敗，請稍後再試');
      }
    });
  });
}

// ── 初始化（匯出）────────────────────────────────────────────
export async function initReviews() {
  // 綁定搜尋框
  const searchIn    = document.getElementById('rv-search');
  const searchClear = document.getElementById('rv-search-clear');

  searchIn?.addEventListener('input', () => {
    _query = searchIn.value.trim();
    searchClear.hidden = !_query;
    // 搜尋時收合展開的課程
    if (_query) _expanded = null;
    render();
  });

  searchClear?.addEventListener('click', () => {
    searchIn.value = '';
    _query = '';
    searchClear.hidden = true;
    searchIn.focus();
    render();
  });

  _loading = true;
  render();
  _reviews = await fetchAllReviews();
  _loading = false;
  render();
}
