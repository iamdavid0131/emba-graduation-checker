import {
  REQUIRED_COURSES, CORE_COURSES,
  SPECIALTY_COURSES, COMMON_COURSES, COURSE_INSTRUCTORS,
} from './data.js?v=14';
import {
  fetchReviewStats, fetchCourseReviews, submitReview,
  deleteReview, updateReview, saveToken, getTokens,
} from './reviews.js?v=14';

// ── 課程分組 ──────────────────────────────────────────────────
const GROUPS = [
  { label: '必修科目',  courses: REQUIRED_COURSES.map(c => c.name) },
  { label: '核心科目',  courses: CORE_COURSES },
  ...Object.entries(SPECIALTY_COURSES).map(([t, cs]) => ({
    label: `${t}組專業`, courses: cs,
  })),
  { label: '共同選修',  courses: COMMON_COURSES },
];

const REVIEWS_LIMIT = 5; // 每位教師預設顯示則數

// ── 狀態 ──────────────────────────────────────────────────────
let _statRows      = [];   // 輕量統計：[{course_name, instructor, rating}]
let _courseCache   = {};   // 完整評價快取：{courseName: [{...}]}
let _courseLoading = new Set();  // 正在載入的課程
let _showAllKey    = new Set();  // "courseName|||instructor" → 展開全部
let _expanded      = null;
let _loading       = true;
let _query         = '';
let _editingId     = null;  // 正在編輯的評價 id

// ── 統計工具（讀 _statRows，輕量）────────────────────────────
function overallStats(name) {
  const rows = _statRows.filter(r => r.course_name === name);
  if (!rows.length) return { avg: 0, count: 0 };
  return {
    avg:   rows.reduce((s, r) => s + r.rating, 0) / rows.length,
    count: rows.length,
  };
}

function instructorStats(name, instructor) {
  const rows = _statRows.filter(r => r.course_name === name && r.instructor === instructor);
  if (!rows.length) return { avg: 0, count: 0 };
  return {
    avg:   rows.reduce((s, r) => s + r.rating, 0) / rows.length,
    count: rows.length,
  };
}

// ── 格式工具 ──────────────────────────────────────────────────
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
  const r = Math.round(n);
  const filled = '★'.repeat(r);
  const empty  = '☆'.repeat(5 - r);
  return color
    ? `<span style="color:#f59e0b">${filled}</span>${empty}`
    : filled + empty;
}

function highlight(name) {
  if (!_query) return name;
  const re = new RegExp(`(${_query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return name.replace(re, '<mark class="rv-hl">$1</mark>');
}

// ── HTML 片段 ─────────────────────────────────────────────────
function reviewItemHtml(r) {
  const tokens  = getTokens();
  const isOwner = r.id && tokens[r.id];
  const editing = _editingId === r.id;

  if (editing) {
    // 內聯編輯表單
    return `
      <div class="rv-item rv-item-editing" data-id="${r.id}">
        <div class="rv-edit-star-row" data-id="${r.id}" data-v="${r.rating}">
          ${[1,2,3,4,5].map(i =>
            `<span class="rv-s ${i <= r.rating ? 'active' : ''}" data-v="${i}">★</span>`
          ).join('')}
        </div>
        <textarea class="rv-edit-comment" data-id="${r.id}" rows="2" maxlength="200">${r.comment || ''}</textarea>
        <div class="rv-edit-actions">
          <button class="rv-save-btn" data-id="${r.id}">✓ 儲存</button>
          <button class="rv-cancel-btn" data-id="${r.id}">✕ 取消</button>
        </div>
      </div>`;
  }

  return `
    <div class="rv-item" data-id="${r.id}">
      <div class="rv-item-top">
        <span class="rv-nick">${r.nickname}</span>
        <span class="rv-item-stars" style="color:#f59e0b">${'★'.repeat(r.rating)}<span style="color:#cbd5e1">${'★'.repeat(5 - r.rating)}</span></span>
        <span class="rv-ago">${timeAgo(r.created_at)}</span>
        ${isOwner ? `
          <button class="rv-edit-btn" data-id="${r.id}" title="編輯">✏️</button>
          <button class="rv-del-btn"  data-id="${r.id}" title="刪除">🗑️</button>
        ` : ''}
      </div>
      ${r.comment ? `<p class="rv-txt">${r.comment}</p>` : ''}
    </div>`;
}

function instructorSectionHtml(courseName, instructor) {
  const cached  = _courseCache[courseName];
  const allRevs = cached ? cached.filter(r => r.instructor === instructor) : [];
  const { avg, count } = instructorStats(courseName, instructor);

  const key      = `${courseName}|||${instructor}`;
  const showAll  = _showAllKey.has(key);
  const shown    = showAll ? allRevs : allRevs.slice(0, REVIEWS_LIMIT);
  const remaining = allRevs.length - REVIEWS_LIMIT;

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
      ${shown.length ? `
        <div class="rv-instr-reviews">
          ${shown.map(reviewItemHtml).join('')}
          ${!showAll && remaining > 0 ? `
            <button class="rv-more-btn"
              data-course="${courseName}"
              data-instructor="${instructor}">
              查看更多（還有 ${remaining} 則）▼
            </button>` : ''
          }
        </div>` : ''
      }
    </div>`;
}

function panelHtml(name) {
  // 載入中
  if (_courseLoading.has(name)) {
    return `
      <div class="rv-panel">
        <div class="rv-loading" style="padding:1.2rem">⏳ 載入評價中…</div>
      </div>`;
  }

  const cached = _courseCache[name] || [];

  // 已知教師 + 評價中出現的教師
  const knownInstructors  = COURSE_INSTRUCTORS[name] || [];
  const reviewInstructors = [...new Set(cached.filter(r => r.instructor).map(r => r.instructor))];
  const allInstructors    = [...new Set([...knownInstructors, ...reviewInstructors])];
  const unknownReviews    = cached.filter(r => !r.instructor);

  // 表單教師欄：只有一位 → 隱藏，自動帶入；多位 → 下拉；未知 → 文字輸入
  const instrFormField = allInstructors.length === 1
    ? `<input type="hidden" class="rv-instr-sel" data-course="${name}" value="${allInstructors[0]}">
       <span class="rv-instr-fixed">👤 ${allInstructors[0]}</span>`
    : allInstructors.length > 1
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
  // 展開 / 收合（lazy load）
  document.querySelectorAll('.rv-course-row').forEach(row => {
    row.addEventListener('click', async () => {
      const name = row.closest('.rv-course').dataset.name;

      if (_expanded === name) {
        _expanded = null;
        render();
        return;
      }

      _expanded = name;

      if (!_courseCache[name] && !_courseLoading.has(name)) {
        _courseLoading.add(name);
        render(); // 顯示 loading 狀態
        _courseCache[name] = await fetchCourseReviews(name);
        _courseLoading.delete(name);
      }

      if (_expanded === name) render();
    });
  });

  // 查看更多
  document.querySelectorAll('.rv-more-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = `${btn.dataset.course}|||${btn.dataset.instructor}`;
      _showAllKey.add(key);
      render();
    });
  });

  // 星等選取
  document.querySelectorAll('.rv-star-row').forEach(row => {
    const hl = v =>
      row.querySelectorAll('.rv-s').forEach((s, i) =>
        s.classList.toggle('active', i < v));

    row.querySelectorAll('.rv-s').forEach(s => {
      s.addEventListener('mouseenter', () => hl(+s.dataset.v));
      s.addEventListener('mouseleave', () => hl(+row.dataset.v));
      s.addEventListener('click', e => {
        e.stopPropagation();
        row.dataset.v = s.dataset.v;
        hl(+s.dataset.v);
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

      const row = await submitReview({ course_name: name, nickname, rating, comment, instructor });
      if (row) {
        if (row.id && row.token) saveToken(row.id, row.token);
        [_statRows, _courseCache[name]] = await Promise.all([
          fetchReviewStats(),
          fetchCourseReviews(name),
        ]);
        render();
      } else {
        btn.disabled    = false;
        btn.textContent = '送出評價';
        alert('送出失敗，請稍後再試');
      }
    });
  });

  // ── 編輯按鈕 ─────────────────────────────────────────────────
  document.querySelectorAll('.rv-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _editingId = btn.dataset.id;
      render();
    });
  });

  // ── 取消編輯 ─────────────────────────────────────────────────
  document.querySelectorAll('.rv-cancel-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _editingId = null;
      render();
    });
  });

  // ── 儲存編輯 ─────────────────────────────────────────────────
  document.querySelectorAll('.rv-save-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id      = btn.dataset.id;
      const token   = getTokens()[id];
      if (!token) return;

      const starRow   = document.querySelector(`.rv-edit-star-row[data-id="${id}"]`);
      const commentEl = document.querySelector(`.rv-edit-comment[data-id="${id}"]`);
      const rating    = starRow ? +starRow.dataset.v : 0;
      const comment   = commentEl?.value.trim() || '';

      if (!rating) { alert('請先選擇星等！'); return; }

      btn.disabled    = true;
      btn.textContent = '儲存中…';

      // 找出評價所屬課程
      const courseName = Object.keys(_courseCache).find(
        cn => _courseCache[cn]?.some(r => r.id === id)
      );

      const ok = await updateReview(id, token, rating, comment);
      if (ok && courseName) {
        _editingId = null;
        [_statRows, _courseCache[courseName]] = await Promise.all([
          fetchReviewStats(),
          fetchCourseReviews(courseName),
        ]);
        render();
      } else {
        btn.disabled    = false;
        btn.textContent = '✓ 儲存';
        alert('更新失敗，請稍後再試');
      }
    });
  });

  // ── 星等選取（編輯表單）──────────────────────────────────────
  document.querySelectorAll('.rv-edit-star-row').forEach(row => {
    const hl = v =>
      row.querySelectorAll('.rv-s').forEach((s, i) =>
        s.classList.toggle('active', i < v));

    row.querySelectorAll('.rv-s').forEach(s => {
      s.addEventListener('mouseenter', () => hl(+s.dataset.v));
      s.addEventListener('mouseleave', () => hl(+row.dataset.v));
      s.addEventListener('click', e => {
        e.stopPropagation();
        row.dataset.v = s.dataset.v;
        hl(+s.dataset.v);
      });
    });
  });

  // ── 刪除按鈕 ─────────────────────────────────────────────────
  document.querySelectorAll('.rv-del-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('確定要刪除這則評價？')) return;

      const id    = btn.dataset.id;
      const token = getTokens()[id];
      if (!token) return;

      const courseName = Object.keys(_courseCache).find(
        cn => _courseCache[cn]?.some(r => r.id === id)
      );

      btn.disabled = true;

      const ok = await deleteReview(id, token);
      if (ok && courseName) {
        [_statRows, _courseCache[courseName]] = await Promise.all([
          fetchReviewStats(),
          fetchCourseReviews(courseName),
        ]);
        render();
      } else {
        btn.disabled = false;
        alert('刪除失敗，請稍後再試');
      }
    });
  });
}

// ── 初始化（匯出）────────────────────────────────────────────
export async function initReviews() {
  const searchIn    = document.getElementById('rv-search');
  const searchClear = document.getElementById('rv-search-clear');

  searchIn?.addEventListener('input', () => {
    _query = searchIn.value.trim();
    searchClear.hidden = !_query;
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
  _statRows = await fetchReviewStats(); // 只撈輕量統計
  _loading  = false;
  render();
}
