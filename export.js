import { RULES } from "./data.js";

// ── 顏色常數 ──────────────────────────────────────────────────
const C = {
  indigo:   "#6366f1",
  indigoL:  "#eef2ff",
  green:    "#10b981",
  greenL:   "#d1fae5",
  red:      "#ef4444",
  redL:     "#fee2e2",
  purple:   "#8b5cf6",
  teal:     "#0d9488",
  text:     "#1e293b",
  muted:    "#64748b",
  border:   "#e2e8f0",
  bg:       "#f8fafc",
  white:    "#ffffff",
};

// ── 工具 ──────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawDonut(ctx, cx, cy, r, pct, color) {
  const start = -Math.PI / 2;
  const end   = start + (2 * Math.PI * pct / 100);
  // track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = C.border;
  ctx.lineWidth   = 16;
  ctx.stroke();
  // fill
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 16;
    ctx.lineCap     = "round";
    ctx.stroke();
    ctx.lineCap     = "butt";
  }
}

function drawProgressBar(ctx, x, y, w, h, pct, color) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = C.border;
  ctx.fill();
  if (pct > 0) {
    const fw = Math.max(h, w * pct / 100);
    roundRect(ctx, x, y, fw, h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function pill(ctx, x, y, label, ok) {
  const pad = 10, ph = 26;
  ctx.font = "bold 13px 'Noto Sans TC', sans-serif";
  const tw  = ctx.measureText(label).width;
  const pw  = tw + pad * 2 + 20;
  roundRect(ctx, x, y, pw, ph, ph / 2);
  ctx.fillStyle = ok ? C.greenL : C.redL;
  ctx.fill();
  ctx.fillStyle = ok ? "#065f46" : "#991b1b";
  ctx.fillText((ok ? "✔ " : "✘ ") + label, x + pad, y + 17);
  return pw + 8;
}

// ── 主繪圖函式 ────────────────────────────────────────────────
export function exportInfographic(state, analyze) {
  const r   = analyze();
  const W   = 820, H = 1160;
  const PAD = 36;

  const canvas = document.createElement("canvas");
  canvas.width  = W * 2;   // retina
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);

  // ── 背景 ──────────────────────────────────────────────────
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);

  // ── Header bar ────────────────────────────────────────────
  ctx.fillStyle = C.indigo;
  ctx.fillRect(0, 0, W, 72);

  // emoji + title
  ctx.font      = "bold 22px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.white;
  ctx.fillText("🎓  EMBA 畢業條件勾稽", PAD, 44);

  // right: track + date
  const track   = state.track ? `${state.track}組` : "（未選組別）";
  const dateStr = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  ctx.font      = "500 13px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.textAlign = "right";
  ctx.fillText(`${track}　${dateStr}`, W - PAD, 44);
  ctx.textAlign = "left";

  let Y = 96;

  // ── 大進度條 ───────────────────────────────────────────────
  const BW = W - PAD * 2;

  ctx.font      = "bold 15px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText("整體進度", PAD, Y + 14);

  ctx.font      = "bold 32px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.text;
  ctx.fillText(`${r.totalDone}`, PAD + 80, Y + 14);
  const totalDoneW = ctx.measureText(`${r.totalDone}`).width;
  ctx.font      = "500 16px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText(`/ ${r.totalNeed} 學分`, PAD + 80 + totalDoneW + 6, Y + 14);

  ctx.textAlign = "right";
  ctx.font      = "bold 28px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = r.pct === 100 ? C.green : C.indigo;
  ctx.fillText(`${r.pct}%`, W - PAD, Y + 14);
  ctx.textAlign = "left";

  Y += 26;
  drawProgressBar(ctx, PAD, Y, BW, 14, r.pct, r.pct === 100 ? C.green : C.indigo);
  Y += 30;

  // ── 3 stat cards ──────────────────────────────────────────
  const cardW = (BW - 16) / 3;
  const cards = [
    { label: "總學分",   done: r.totalDone,        need: r.totalNeed,         sub: `${r.pct}%` },
    { label: "選修學分", done: r.electiveCredits,   need: r.electiveCreditsNeed },
    { label: "選修門數", done: r.electiveCount,     need: r.electiveCountNeed },
  ];
  cards.forEach((c, i) => {
    const ok  = c.done >= c.need;
    const cx  = PAD + i * (cardW + 8);
    roundRect(ctx, cx, Y, cardW, 78, 12);
    ctx.fillStyle = ok ? C.greenL : C.redL;
    ctx.fill();

    ctx.font      = "600 11px 'Noto Sans TC', sans-serif";
    ctx.fillStyle = C.muted;
    ctx.fillText(c.label.toUpperCase(), cx + 14, Y + 20);

    ctx.font      = `bold 26px 'Noto Sans TC', sans-serif`;
    ctx.fillStyle = C.text;
    ctx.fillText(`${c.done}`, cx + 14, Y + 52);
    const doneW = ctx.measureText(`${c.done}`).width;
    ctx.font      = "500 14px 'Noto Sans TC', sans-serif";
    ctx.fillStyle = C.muted;
    ctx.fillText(` / ${c.need}`, cx + 14 + doneW, Y + 52);

    if (c.sub) {
      ctx.font      = "600 13px 'Noto Sans TC', sans-serif";
      ctx.fillStyle = ok ? C.teal : C.muted;
      ctx.fillText(c.sub, cx + 14, Y + 70);
    }
  });
  Y += 94;

  // ── 分隔線 ────────────────────────────────────────────────
  function divider() {
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, Y); ctx.lineTo(W - PAD, Y);
    ctx.stroke();
    Y += 16;
  }

  divider();

  // ── 分項進度 ───────────────────────────────────────────────
  ctx.font      = "bold 15px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText("分項進度", PAD, Y + 12);
  Y += 26;

  const bars = [
    { label: "必修學科",      done: r.nonThesisDone,  total: r.nonThesisNeed },
    { label: "碩士論文",      done: Math.min(r.reqCreditsDone - r.nonThesisDone, 6), total: 6 },
    { label: "核心科目（門）", done: r.coreCount,      total: r.coreNeed },
    { label: `${state.track ?? "?"}組專業（門）`, done: r.specCount, total: r.specNeed },
    { label: "選修合計（門）", done: r.electiveCount,  total: r.electiveCountNeed },
    { label: "選修合計（學分）",done: r.electiveCredits,total: r.electiveCreditsNeed },
  ];

  const LW = 150, barX = PAD + LW + 8, barW = BW - LW - 70;
  bars.forEach(b => {
    const pct   = b.total ? Math.min(100, Math.round(b.done / b.total * 100)) : 0;
    const color = pct === 100 ? C.green : pct >= 50 ? C.indigo : C.red;

    ctx.font      = "500 13px 'Noto Sans TC', sans-serif";
    ctx.fillStyle = C.muted;
    ctx.fillText(b.label, PAD, Y + 11);

    drawProgressBar(ctx, barX, Y, barW, 10, pct, color);

    ctx.font      = "600 12px 'Noto Sans TC', sans-serif";
    ctx.fillStyle = pct === 100 ? C.green : C.text;
    ctx.textAlign = "right";
    ctx.fillText(`${b.done} / ${b.total}`, W - PAD, Y + 11);
    ctx.textAlign = "left";

    Y += 26;
  });

  Y += 4;
  divider();

  // ── 畢業條件 pills ────────────────────────────────────────
  ctx.font      = "bold 15px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText("畢業條件檢核", PAD, Y + 12);
  Y += 28;

  const pillData = [
    { label: "必修 12 學分",   ok: r.reqCreditsDone  >= r.reqCreditsNeed },
    { label: "必修學科 6 學分", ok: r.nonThesisDone   >= r.nonThesisNeed },
    { label: "碩士論文 ×2",    ok: r.reqCreditsDone - r.nonThesisDone >= 6 },
    { label: "核心 ≥4 門",     ok: r.coreCount       >= r.coreNeed },
    { label: "專業 ≥3 門",     ok: r.specCount       >= r.specNeed },
    { label: "選修 36 學分",   ok: r.electiveCredits >= r.electiveCreditsNeed },
    { label: "選修 12 門",     ok: r.electiveCount   >= r.electiveCountNeed },
    { label: "學術倫理",       ok: r.ethicsDone },
    { label: "修課證明",       ok: r.certSubmitted },
  ];

  let px = PAD, py = Y;
  pillData.forEach(p => {
    ctx.font = "bold 13px 'Noto Sans TC', sans-serif";
    const pw = ctx.measureText("✔ " + p.label).width + 28;
    if (px + pw > W - PAD) { px = PAD; py += 36; }
    const w  = pill(ctx, px, py, p.label, p.ok);
    px += w;
  });
  Y = py + 46;

  divider();

  // ── Donut + summary ───────────────────────────────────────
  const dCX = PAD + 64, dCY = Y + 64, dR = 52;
  drawDonut(ctx, dCX, dCY, dR, r.pct, r.pct === 100 ? C.green : C.indigo);
  ctx.font      = "bold 22px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.fillText(`${r.pct}%`, dCX, dCY + 8);
  ctx.textAlign = "left";

  // summary text
  const allDone = r.pct === 100 && r.ethicsDone && r.certSubmitted;
  const summaryX = PAD + 148;
  ctx.font      = "bold 18px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = allDone ? C.green : C.text;
  ctx.fillText(allDone ? "🎓 畢業條件全部達成！" : "尚有條件待完成", summaryX, Y + 36);
  ctx.font      = "500 13px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.fillText(`已完成 ${r.totalDone} / ${r.totalNeed} 學分，`
    + `選修 ${r.electiveCount} / ${r.electiveCountNeed} 門`, summaryX, Y + 60);
  ctx.fillText(`核心 ${r.coreCount}/${r.coreNeed} 門　`
    + `${state.track ?? "?"}組專業 ${r.specCount}/${r.specNeed} 門`, summaryX, Y + 80);

  Y += 148;

  // ── Footer ────────────────────────────────────────────────
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, Y, W, H - Y);
  ctx.font      = "500 12px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.muted;
  ctx.textAlign = "center";
  ctx.fillText("依據「畢業條件自我勾稽表」(111.5 版)　資料僅供個人參考", W / 2, Y + 24);
  ctx.font      = "600 13px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = C.text;
  ctx.fillText("製作者：114 財金 陳家祥", W / 2, Y + 46);
  ctx.textAlign = "left";

  // ── 開新分頁顯示圖片（手機長按即可儲存）────────────────────
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EMBA畢業勾稽</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1e293b; display:flex; flex-direction:column; align-items:center; min-height:100vh; padding:16px; }
  p { color:#94a3b8; font-size:14px; margin-bottom:12px; font-family:sans-serif; text-align:center; }
  img { max-width:100%; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,.4); }
</style>
</head><body>
<p>📱 長按圖片即可儲存到相簿</p>
<img src="${dataUrl}" alt="EMBA畢業勾稽">
</body></html>`);
    win.document.close();
  }
}
