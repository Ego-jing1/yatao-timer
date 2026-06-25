
(() => {
'use strict';

const VERSION = '3.0.0';
const SUPABASE_URL = "https://bceamidjnggzpvumswdg.supabase.co";
const SUPABASE_KEY = "sb_publishable_vyHgXa5d0H1q845f5poKcA_6UnXHXkL";
const BUCKET = "ortho-photos";
const STORAGE_KEY = "yatao_timer_v2";
const GOAL_MS = 22 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pad = (n) => String(n).padStart(2, "0");
const fmt = (ms) => {
  ms = Math.max(0, ms || 0);
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};
const fmtShort = (ms) => fmt(ms).slice(3);
const dateStr = (d) => d.toISOString().slice(0, 10);

let user = null;
let syncTimer = null;
let currentPage = "home";
let chew = { left: 0, total: 0, running: false, last: 0 };
let state = loadState();

function loadState() {
  const now = new Date();
  const defaultState = {
    settings: {
      brand: "时代天使",
      totalTrays: 42,
      currentTray: 1,
      daysPerTray: 7,
      trayStartDate: dateStr(now),
      trayStartTime: "12:00",
      cycleStartTime: "12:00",
    },
    periods: {},
    notes: [],
    expenses: [],
    trayHistory: [],
    reminder: { offAlertMin: 60, trayAlert: true },
    lastCloudPullAt: null,
  };
  try {
    return Object.assign(defaultState, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return defaultState;
  }
}

function persist(schedule = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (schedule) syncLater();
}

function cycleStartFor(now = new Date()) {
  const [h, m] = (state.settings.cycleStartTime || "12:00").split(":").map(Number);
  const start = new Date(now);
  start.setHours(h || 0, m || 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  return start;
}
function periodKey(now = new Date()) { return dateStr(cycleStartFor(now)); }
function ensurePeriod(k = periodKey()) {
  if (!state.periods[k]) {
    state.periods[k] = {
      offMs: 0,
      isWearing: true,
      lastChange: Date.now(),
      events: [],
      chewMs: 0,
    };
  }
  return state.periods[k];
}
function period() { return ensurePeriod(periodKey()); }
function offMs(k = periodKey()) {
  const p = ensurePeriod(k);
  let ms = p.offMs || 0;
  if (k === periodKey() && !p.isWearing) ms += Date.now() - p.lastChange;
  return ms;
}
function cycleElapsedMs(k = periodKey()) {
  if (k === periodKey()) {
    const elapsed = Date.now() - cycleStartFor().getTime();
    return Math.max(0, Math.min(DAY_MS, elapsed));
  }
  return DAY_MS;
}
function wearMs(k = periodKey()) {
  return Math.max(0, cycleElapsedMs(k) - offMs(k));
}
function trayStart() {
  const s = state.settings;
  return new Date(`${s.trayStartDate}T${s.trayStartTime || "12:00"}:00`);
}
function nextTrayDate() {
  const d = trayStart();
  d.setDate(d.getDate() + Number(state.settings.daysPerTray || 7));
  return d;
}
function dayHour(ms) {
  ms = Math.max(0, ms || 0);
  return `${Math.floor(ms / DAY_MS)} 天 ${Math.floor((ms % DAY_MS) / 3600000)} 小时`;
}
function streak() {
  let n = 0;
  const keys = Object.keys(state.periods).sort().reverse();
  for (const k of keys) {
    if (wearMs(k) >= GOAL_MS) n++;
    else break;
  }
  return n;
}
function avg(days) {
  const keys = Object.keys(state.periods).sort().slice(-days);
  let sum = 0, ok = 0;
  for (const k of keys) {
    const hours = wearMs(k) / 3600000;
    sum += hours;
    if (hours >= 22) ok++;
  }
  return { keys, avg: keys.length ? sum / keys.length : 0, ok, total: keys.length };
}

function render(page = currentPage) {
  currentPage = page;
  ensurePeriod();
  $("#app").innerHTML = `
    <div class="wrap">
      <div class="top">
        <h1>牙套时间管家</h1>
        <div class="muted">${user ? "云同步开启" : "本地/未登录"}</div>
      </div>
      ${user ? accountCard() : authCard()}
      <main>${pageHtml(page)}</main>
      <nav class="tabs">
        ${tabButton("home","首页",page)}
        ${tabButton("tray","牙套",page)}
        ${tabButton("stats","统计",page)}
        ${tabButton("diary","日记",page)}
        ${tabButton("expense","支出",page)}
        ${tabButton("remind","提醒",page)}
      </nav>
    </div>`;
  bind();
  if (page === "stats") drawChart(7);
}
function tabButton(k, label, page) { return `<button class="tab ${page===k?"active":""}" data-page="${k}">${label}</button>`; }

function authCard() {
  return `<div class="card">
    <h2>云同步登录</h2>
    <p class="muted">邮箱登录后同步到 Supabase，换手机也能恢复。未登录也能本地使用。</p>
    <input id="email" type="email" placeholder="邮箱">
    <br><br>
    <input id="pwd" type="password" placeholder="密码，至少6位">
    <div class="btn2">
      <button id="signup">注册</button>
      <button id="signin" class="green">登录</button>
    </div>
    <button id="local" class="black" style="width:100%;margin-top:12px">暂时本地使用</button>
    <p id="msg" class="muted"></p>
  </div>`;
}
function accountCard() {
  return `<div class="card">
    <div class="row"><b>账号</b><span class="muted">${user.email || ""}</span></div>
    <div class="btn2"><button id="pull" class="gray">读取云端</button><button id="signout" class="black">退出登录</button></div>
  </div>`;
}
function pageHtml(p) {
  const map = { home: homeHtml, tray: trayHtml, stats: statsHtml, diary: diaryHtml, expense: expenseHtml, remind: remindHtml };
  return map[p] ? map[p]() : homeHtml();
}


function offIntervalsForPeriod(p) {
  const events = p.events || [];
  const intervals = [];
  let openOff = null;

  for (const ev of events) {
    if (ev[0] === "off") {
      openOff = ev[1];
    } else if (ev[0] === "on" && openOff) {
      intervals.push({ start: openOff, end: ev[1], ms: ev[1] - openOff, type: "auto" });
      openOff = null;
    } else if (ev[0] === "manual_off") {
      intervals.push({ start: ev[1], end: ev[2], ms: ev[3], type: "manual" });
    }
  }

  if (openOff) {
    intervals.push({ start: openOff, end: Date.now(), ms: Date.now() - openOff, type: "current" });
  }

  return intervals.sort((a,b)=>a.start-b.start);
}

function timeHM(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function offRecordsHtml() {
  const p = period();
  const intervals = offIntervalsForPeriod(p);
  if (!intervals.length) return '<p class="muted">本周期暂无摘下记录</p>';

  return intervals.map((it, idx) => `
    <div class="offRecord">
      <span>${timeHM(it.start)} ~ ${timeHM(it.end)} ｜ 摘下 ${Math.round(it.ms/60000)} 分钟${it.type==="current" ? "（进行中）" : ""}</span>
      <span>
        ${it.type === "manual" ? `<button class="gray iconBtn editOffRecord" data-index="${idx}">✎</button>` : ""}
        ${it.type === "manual" ? `<button class="gray iconBtn deleteOffRecord" data-index="${idx}">×</button>` : ""}
      </span>
    </div>
  `).join("");
}

function dateTimeLocalValue(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function getManualEvents() {
  return period().events.filter(e => e[0] === "manual_off");
}

function editOffRecord(index) {
  const intervals = offIntervalsForPeriod(period());
  const item = intervals[index];
  if (!item || item.type !== "manual") return;
  const manualEvents = getManualEvents();
  const eventIndex = manualEvents.findIndex(e => e[1] === item.start && e[2] === item.end);
  if (eventIndex < 0) return;

  $("#manualEditIndex").value = eventIndex;
  $("#manualStart").value = dateTimeLocalValue(item.start);
  $("#manualEnd").value = dateTimeLocalValue(item.end);
  $("#manualAdd").textContent = "保存修改";
  $("#manualCancel").classList.remove("hidden");
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

function deleteOffRecord(index) {
  const intervals = offIntervalsForPeriod(period());
  const item = intervals[index];
  if (!item || item.type !== "manual") return;
  if (!confirm(`确定删除这条摘下记录吗？\n${timeHM(item.start)} ~ ${timeHM(item.end)}，${Math.round(item.ms/60000)}分钟`)) return;

  const events = period().events;
  const pos = events.findIndex(e => e[0] === "manual_off" && e[1] === item.start && e[2] === item.end);
  if (pos >= 0) {
    period().offMs -= events[pos][3] || 0;
    if (period().offMs < 0) period().offMs = 0;
    events.splice(pos, 1);
    persist();
    render("home");
  }
}

function cancelManualEdit() {
  $("#manualEditIndex").value = "";
  $("#manualStart").value = "";
  $("#manualEnd").value = "";
  $("#manualAdd").textContent = "添加补记";
  $("#manualCancel").classList.add("hidden");
}

function homeHtml() {
  const p = period();
  const start = cycleStartFor();
  const end = new Date(start.getTime() + DAY_MS);
  const wear = wearMs(), off = offMs(), pct = Math.min(100, wear / GOAL_MS * 100);
  const curOff = p.isWearing ? 0 : Date.now() - p.lastChange;
  return `<div class="card">
    <div class="sub">本周期已佩戴</div>
    <div class="big">${fmt(wear)}</div>
    <div class="sub">当前状态：${p.isWearing ? "佩戴中" : "已摘下"}</div>
    <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
    <div class="sub">目标：22小时 / 24小时周期</div>
    <div class="btn2">
      <button id="markOff" class="red" ${!p.isWearing ? "disabled" : ""}>摘下牙套</button>
      <button id="markOn" class="green" ${p.isWearing ? "disabled" : ""}>戴回牙套</button>
    </div>
  </div>
  <div class="card">
    <h2>统计周期</h2>
    <div class="row"><b>周期</b><span>${dateStr(start)} ${pad(start.getHours())}:${pad(start.getMinutes())} - ${dateStr(end)} ${pad(end.getHours())}:${pad(end.getMinutes())}</span></div>
    <div class="row"><b>摘下累计</b><span>${fmt(off)}</span></div>
    <div class="row"><b>剩余可摘</b><span>${fmt(7200000 - off)}</span></div>
    <div class="row"><b>本次摘下</b><span>${fmt(curOff)}</span></div>
    <div class="row"><b>摘下次数</b><span>${(p.events || []).filter(e => String(e[0]).includes("off")).length} 次</span></div>
    <div class="row"><b>连续达标</b><span>${streak()} 天</span></div>
    <div class="row"><b>咬胶累计</b><span>${fmt(p.chewMs || 0)}</span></div>
  </div>
  <div class="card">
    <h2>今日事件</h2>
    <div class="timeline">${eventList(p)}</div>
  </div>
  <div class="card">
    <h2>咬胶计时器</h2>
    <div class="big" id="chewTime">${fmtShort(chew.left)}</div>
    <div class="btn3">
      <button data-chew="60">1分钟</button>
      <button data-chew="120">2分钟</button>
      <button data-chew="180">3分钟</button>
    </div>
    <div class="btn2">
      <button id="chewPause" class="black">暂停/继续</button>
      <button id="chewReset" class="red">重置</button>
    </div>
  </div>
  <div class="card">
    <h2>本周期摘下记录</h2>
    <p class="muted">自动记录每次摘下与戴回时间；手动补记的记录可以修改或删除。</p>
    <div>${offRecordsHtml()}</div>
  </div>
  <div class="card">
    <h2>手动补记摘下时间</h2>
    <p class="muted">忘记点击时，在这里补记，会加入当前统计周期。</p>
    <input id="manualEditIndex" type="hidden">
    <label>摘下时间</label><input id="manualStart" type="datetime-local">
    <br><br>
    <label>戴回时间</label><input id="manualEnd" type="datetime-local">
    <br><br>
    <div class="btn2">
      <button id="manualAdd" class="green">添加补记</button>
      <button id="manualCancel" class="gray hidden">取消修改</button>
    </div>
  </div>`;
}
function eventList(p) {
  const items = (p.events || []).slice(-10).reverse();
  if (!items.length) return `<p class="muted">暂无事件</p>`;
  return items.map(ev => {
    const type = ev[0] === "off" ? "摘下" : ev[0] === "on" ? "戴回" : "补记摘下";
    const extra = ev[3] ? `　${fmt(ev[3])}` : "";
    return `<div class="event">${new Date(ev[1]).toLocaleTimeString()}　${type}${extra}</div>`;
  }).join("");
}

function trayHtml() {
  const s = state.settings;
  const progress = Math.round((s.currentTray - 1) / s.totalTrays * 100);
  const left = nextTrayDate() - new Date();
  return `<div class="card">
    <h2>牙套进度</h2>
    <div class="row"><b>品牌</b><span>${s.brand || "时代天使"}</span></div>
    <div class="row"><b>当前</b><span>第 ${s.currentTray} / ${s.totalTrays} 副</span></div>
    <div class="progress"><div class="bar" style="width:${progress}%"></div></div>
    <div class="sub">整体进度 ${progress}%</div>
    <div class="row"><b>换牙套倒计时</b><span>${left <= 0 ? "可以换牙套了" : dayHour(left)}</span></div>
    <div class="row"><b>本副已佩戴</b><span>${dayHour(Date.now() - trayStart())}</span></div>
    <button id="nextTrayBtn" class="green">记录已换到下一副</button>
  </div>
  <div class="card">
    <h2>牙套设置</h2>
    <label>品牌</label><input id="brand" value="${s.brand || "时代天使"}"><br><br>
    <label>总副数</label><input id="totalTrays" type="number" min="1" value="${s.totalTrays}"><br><br>
    <label>当前第几副</label><input id="currentTray" type="number" min="1" value="${s.currentTray}"><br><br>
    <label>每副佩戴天数</label><input id="daysPerTray" type="number" min="1" value="${s.daysPerTray}"><br><br>
    <label>本副开始日期</label><input id="trayStartDate" type="date" value="${s.trayStartDate}"><br><br>
    <label>本副开始时间</label><input id="trayStartTime" type="time" value="${s.trayStartTime}"><br><br>
    <label>每日周期开始时间</label><input id="cycleStartTime" type="time" value="${s.cycleStartTime}"><br><br>
    <button id="saveTray" class="green">保存设置</button>
  </div>
  <div class="card">
    <h2>换牙套历史</h2>
    ${state.trayHistory.map(h => `<div class="row"><span>第${h.from} → 第${h.to}副</span><span class="muted">${h.at}</span></div>`).join("") || '<p class="muted">暂无记录</p>'}
  </div>`;
}

function statsHtml() {
  const a7 = avg(7);
  return `<div class="card">
    <h2 class="center">统计</h2>
    <div class="seg">
      <button class="range active" data-days="7">每日</button>
      <button class="range" data-days="28">每周</button>
      <button class="range" data-days="90">每月</button>
    </div>
    <div class="center"><span class="dot"></span>${state.settings.brand || "时代天使"}</div>
    <div class="rangeText" id="rangeText">最近7周期</div>
    <div class="chartCard"><canvas id="chart" width="500" height="300"></canvas></div>
    <div class="ringBox">
      <div><div class="ring" id="ring7"><div><b id="avg7">0</b><span>小时</span></div></div><div class="ringLabel">7天平均</div></div>
      <div><div class="ring" id="ring30"><div><b id="avg30">0</b><span>小时</span></div></div><div class="ringLabel">30天平均</div></div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div class="stat"><div class="muted">连续达标</div><b>${streak()}天</b></div>
      <div class="stat"><div class="muted">最近7天达标</div><b>${a7.ok} / ${a7.total || 7}</b></div>
    </div>
  </div>`;
}

function diaryHtml() {
  return `<div class="card">
    <h2>图文日记</h2>
    <textarea id="noteText" placeholder="记录酸痛、黑三角、牙龈、附件、复诊等"></textarea><br><br>
    <label>上传照片，可多选</label><input id="notePhotos" type="file" accept="image/*" multiple>
    <p class="muted">登录后照片会压缩上传到 Supabase Storage；未登录时保存在本地。</p>
    <button id="saveNote" class="green">保存日记</button>
  </div>
  <div class="card">
    <h2>日记记录</h2>
    ${state.notes.map(n => `<div class="row" style="display:block">
      <b>第${n.tray}副</b> ${n.text || ""}
      <div class="muted">${n.at}</div>
      <div class="thumbGrid">${(n.photos || []).map(p => `<img class="thumb" src="${p.url}">`).join("")}</div>
    </div>`).join("") || '<p class="muted">暂无日记</p>'}
  </div>`;
}

function expenseHtml() {
  const total = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  return `<div class="card">
    <h2>支出记录</h2>
    <input id="expenseEditId" type="hidden">
    <input id="expenseAmount" type="number" step="0.01" placeholder="金额"><br><br>
    <select id="expenseCategory"><option>正畸费用</option><option>复诊</option><option>清洁护理</option><option>牙线/冲牙器</option><option>保持器</option><option>交通</option><option>其他</option></select><br><br>
    <input id="expenseDate" type="date" value="${dateStr(new Date())}"><br><br>
    <input id="expenseNote" placeholder="备注"><br><br>
    <div class="btn2">
      <button id="saveExpense" class="green">保存支出</button>
      <button id="cancelExpenseEdit" class="gray hidden">取消修改</button>
    </div>
  </div>
  <div class="card">
    <h2>支出统计</h2>
    <div class="muted center">累计支出</div>
    <div class="expenseTotal">¥${total.toFixed(2)}</div>
    ${state.expenses.map(e => `<div class="row" style="align-items:flex-start">
      <span><span class="pill">${e.category}</span> ${e.note || ""}<br><span class="muted">${e.date}</span></span>
      <span style="text-align:right"><b>¥${Number(e.amount).toFixed(2)}</b><br>
        <button class="gray smallBtn editExpense" data-id="${e.id}">修改</button>
        <button class="red smallBtn deleteExpense" data-id="${e.id}">删除</button>
      </span>
    </div>`).join("") || '<p class="muted">暂无支出</p>'}
  </div>`;
}

function remindHtml() {
  return `<div class="card">
    <h2>提醒设置</h2>
    <p class="muted">网页提醒需要打开页面。iPhone 后台通知后续可以接入。</p>
    <label>摘下超过提醒</label>
    <select id="offAlert">
      <option value="30" ${state.reminder.offAlertMin == 30 ? "selected" : ""}>30分钟</option>
      <option value="60" ${state.reminder.offAlertMin == 60 ? "selected" : ""}>60分钟</option>
      <option value="90" ${state.reminder.offAlertMin == 90 ? "selected" : ""}>90分钟</option>
    </select><br><br>
    <button id="saveRemind" class="green">保存提醒</button>
  </div>`;
}

function bind() {
  $$(".tab").forEach(b => b.onclick = () => render(b.dataset.page));

  const signup = $("#signup");
  if (signup) {
    signup.onclick = signUp;
    $("#signin").onclick = signIn;
    $("#local").onclick = () => render("home");
  }
  if ($("#signout")) $("#signout").onclick = signOut;
  if ($("#pull")) $("#pull").onclick = async () => { await pullCloud(); render(currentPage); };

  if ($("#markOff")) $("#markOff").onclick = markOff;
  if ($("#markOn")) $("#markOn").onclick = markOn;
  $$("[data-chew]").forEach(b => b.onclick = () => startChew(Number(b.dataset.chew)));
  if ($("#chewPause")) $("#chewPause").onclick = pauseChew;
  if ($("#chewReset")) $("#chewReset").onclick = () => { chew = { left: 0, total: 0, running: false, last: 0 }; render("home"); };
  if ($("#manualAdd")) $("#manualAdd").onclick = manualAdd;
  if ($("#manualCancel")) $("#manualCancel").onclick = cancelManualEdit;
  $$(".editOffRecord").forEach(b => b.onclick = () => editOffRecord(Number(b.dataset.index)));
  $$(".deleteOffRecord").forEach(b => b.onclick = () => deleteOffRecord(Number(b.dataset.index)));

  if ($("#saveTray")) $("#saveTray").onclick = saveTray;
  if ($("#nextTrayBtn")) $("#nextTrayBtn").onclick = nextTrayClick;
  if ($("#saveNote")) $("#saveNote").onclick = saveNote;
  if ($("#saveExpense")) $("#saveExpense").onclick = saveExpense;
  if ($("#cancelExpenseEdit")) $("#cancelExpenseEdit").onclick = cancelExpenseEdit;
  $$(".editExpense").forEach(b => b.onclick = () => editExpense(b.dataset.id));
  $$(".deleteExpense").forEach(b => b.onclick = () => deleteExpense(b.dataset.id));
  if ($("#saveRemind")) $("#saveRemind").onclick = saveRemind;

  $$(".range").forEach(b => b.onclick = () => {
    $$(".range").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    drawChart(Number(b.dataset.days));
  });
}

function markOff() {
  const p = period();
  if (!p.isWearing) return;
  p.isWearing = false;
  p.lastChange = Date.now();
  p.events.push(["off", Date.now()]);
  persist();
  render("home");
}
function markOn() {
  const p = period();
  if (p.isWearing) return;
  p.offMs += Date.now() - p.lastChange;
  p.isWearing = true;
  p.lastChange = Date.now();
  p.events.push(["on", Date.now()]);
  persist();
  render("home");
}
function manualAdd() {
  const s = new Date($("#manualStart").value);
  const e = new Date($("#manualEnd").value);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return alert("请填写正确的摘下和戴回时间");

  const p = period();
  const ms = e - s;
  const editIndex = $("#manualEditIndex") ? $("#manualEditIndex").value : "";

  if (editIndex !== "") {
    const manualEvents = getManualEvents();
    const old = manualEvents[Number(editIndex)];
    if (!old) return alert("没有找到要修改的记录");
    const pos = p.events.findIndex(ev => ev === old);
    if (pos >= 0) {
      p.offMs = Math.max(0, (p.offMs || 0) - (old[3] || 0) + ms);
      p.events[pos] = ["manual_off", s.getTime(), e.getTime(), ms];
    }
  } else {
    p.offMs += ms;
    p.events.push(["manual_off", s.getTime(), e.getTime(), ms]);
  }

  persist();
  render("home");
}

function startChew(seconds) { chew = { left: seconds * 1000, total: seconds * 1000, running: true, last: Date.now() }; }
function pauseChew() {
  if (chew.running) { tickChew(); chew.running = false; }
  else if (chew.left > 0) { chew.running = true; chew.last = Date.now(); }
}
function tickChew() {
  if (!chew.running) return;
  const now = Date.now();
  const used = now - chew.last;
  chew.left -= used;
  chew.last = now;
  period().chewMs = (period().chewMs || 0) + used;
  if (chew.left <= 0) {
    chew.left = 0;
    chew.running = false;
    alert("咬胶完成");
  }
  persist();
}

function saveTray() {
  state.settings = {
    brand: $("#brand").value || "时代天使",
    totalTrays: Number($("#totalTrays").value || 42),
    currentTray: Number($("#currentTray").value || 1),
    daysPerTray: Number($("#daysPerTray").value || 7),
    trayStartDate: $("#trayStartDate").value || dateStr(new Date()),
    trayStartTime: $("#trayStartTime").value || "12:00",
    cycleStartTime: $("#cycleStartTime").value || "12:00",
  };
  persist();
  render("tray");
}
function nextTrayClick() {
  const s = state.settings;
  if (s.currentTray >= s.totalTrays) return alert("已经是最后一副");
  state.trayHistory.unshift({ from: s.currentTray, to: s.currentTray + 1, at: new Date().toLocaleString() });
  s.currentTray++;
  const n = new Date();
  s.trayStartDate = dateStr(n);
  s.trayStartTime = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  persist();
  render("tray");
}

function saveExpense() {
  const amount = Number($("#expenseAmount").value);
  if (!amount || amount <= 0) return alert("请输入金额");

  const editId = $("#expenseEditId").value;
  const item = {
    id: editId ? Number(editId) : Date.now(),
    amount,
    category: $("#expenseCategory").value,
    date: $("#expenseDate").value || dateStr(new Date()),
    note: $("#expenseNote").value.trim(),
    at: new Date().toLocaleString(),
  };

  if (editId) {
    const idx = state.expenses.findIndex(e => Number(e.id) === Number(editId));
    if (idx >= 0) state.expenses[idx] = { ...state.expenses[idx], ...item, editedAt: new Date().toLocaleString() };
  } else {
    state.expenses.unshift(item);
  }

  persist();
  render("expense");
}

function editExpense(id) {
  const e = state.expenses.find(x => Number(x.id) === Number(id));
  if (!e) return;
  $("#expenseEditId").value = e.id;
  $("#expenseAmount").value = e.amount;
  $("#expenseCategory").value = e.category;
  $("#expenseDate").value = e.date;
  $("#expenseNote").value = e.note || "";
  $("#saveExpense").textContent = "保存修改";
  $("#cancelExpenseEdit").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelExpenseEdit() {
  $("#expenseEditId").value = "";
  $("#expenseAmount").value = "";
  $("#expenseNote").value = "";
  $("#expenseDate").value = dateStr(new Date());
  $("#saveExpense").textContent = "保存支出";
  $("#cancelExpenseEdit").classList.add("hidden");
}

function deleteExpense(id) {
  const e = state.expenses.find(x => Number(x.id) === Number(id));
  if (!e) return;
  if (!confirm(`确定删除这笔支出吗？\n${e.category} ${e.note || ""} ¥${Number(e.amount).toFixed(2)}`)) return;
  state.expenses = state.expenses.filter(x => Number(x.id) !== Number(id));
  persist();
  render("expense");
}

function saveRemind() {
  state.reminder.offAlertMin = Number($("#offAlert").value);
  persist();
  alert("已保存");
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("照片压缩失败")), "image/jpeg", 0.8);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function blobToDataUrl(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}
async function saveNote() {
  const text = $("#noteText").value.trim();
  const files = Array.from($("#notePhotos").files || []);
  if (!text && files.length === 0) return alert("请填写日记或上传照片");
  const photos = [];
  for (const file of files) {
    const blob = await compressImage(file);
    if (user) {
      const path = `${user.id}/tray_${state.settings.currentTray}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const up = await sb.storage.from("ortho-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) { alert("照片上传失败：" + up.error.message); continue; }
      const pub = sb.storage.from("ortho-photos").getPublicUrl(path);
      photos.push({ url: pub.data.publicUrl, path });
    } else {
      photos.push({ url: await blobToDataUrl(blob), local: true });
    }
  }
  state.notes.unshift({
    id: Date.now(),
    tray: state.settings.currentTray,
    period: periodKey(),
    text,
    photos,
    at: new Date().toLocaleString(),
  });
  persist();
  render("diary");
}

function drawChart(days = 7) {
  const s = avg(days), s7 = avg(7), s30 = avg(30);
  $("#avg7").textContent = s7.avg.toFixed(1);
  $("#avg30").textContent = s30.avg.toFixed(1);
  setRing("ring7", s7.avg);
  setRing("ring30", s30.avg);
  if (s.keys.length) $("#rangeText").textContent = `${s.keys[0].replaceAll("-","/")} - ${s.keys.at(-1).replaceAll("-","/")}`;

  const cv = $("#chart");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0,0,500,300);
  const L=42,T=30,W=430,H=210;
  const y20 = T + H - (20/24)*H;
  ctx.strokeStyle="#74c982"; ctx.setLineDash([8,6]); ctx.beginPath(); ctx.moveTo(L,y20); ctx.lineTo(L+W,y20); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle="#777"; ctx.font="14px sans-serif"; ctx.fillText("24",8,T+6); ctx.fillText("0",14,T+H);
  ctx.fillStyle="#74c982"; ctx.fillText("20",L+W-5,y20-8);

  const keys = s.keys;
  let points = keys.map((k,i) => {
    const hours = wearMs(k)/3600000;
    return {
      x: L + (keys.length===1 ? W/2 : i*W/(keys.length-1)),
      y: T + H - Math.min(24,hours)/24*H,
      hours, k
    };
  });
  if (points.length > 1) {
    ctx.strokeStyle="#74c982"; ctx.lineWidth=3; ctx.beginPath();
    points.forEach((p,i)=> i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
    ctx.stroke();
  }
  points.forEach(p => {
    ctx.fillStyle = p.hours>=22 ? "#74c982" : "#ffb020";
    ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#5b9f62"; ctx.fillText(p.hours.toFixed(1),p.x-12,p.y-18);
    ctx.fillStyle="#888";
    const d = new Date(p.k+"T00:00:00");
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,p.x-14,T+H+28);
  });
}
function setRing(id, val) {
  const el = $("#"+id);
  if (!el) return;
  const deg = Math.min(360, val / 24 * 360);
  el.style.background = `conic-gradient(var(--green) 0deg,var(--green) ${deg}deg,#e9f6ec ${deg}deg)`;
}

async function signUp() {
  const msg = $("#msg");
  msg.textContent = "注册中...";
  const email = $("#email").value.trim(), password = $("#pwd").value;
  const res = await sb.auth.signUp({ email, password });
  msg.textContent = res.error ? "注册失败：" + res.error.message : "注册成功，请登录或查看邮箱验证";
}
async function signIn() {
  const msg = $("#msg");
  msg.textContent = "登录中...";
  const email = $("#email").value.trim(), password = $("#pwd").value;
  const res = await sb.auth.signInWithPassword({ email, password });
  if (res.error) { msg.textContent = "登录失败：" + res.error.message; return; }
  user = res.data.user;
  await pullCloud();
  render("home");
}
async function signOut() {
  await syncNow();
  await sb.auth.signOut();
  user = null;
  render("home");
}
async function pullCloud() {
  if (!user) return;
  const res = await sb.from("aligner_records").select("*").order("record_date");
  if (res.error) { alert("读取云端失败：" + res.error.message); return; }
  for (const row of (res.data || [])) {
    try {
      const payload = JSON.parse(row.note || "{}");
      state = Object.assign(state, payload);
    } catch {}
  }
  state.lastCloudPullAt = new Date().toISOString();
  persist(false);
}
function syncLater() {
  if (!user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1000);
}
async function syncNow() {
  if (!user) return;
  const p = period(), k = periodKey(), off = offMs();
  const payload = {
    settings: state.settings,
    periods: state.periods,
    notes: state.notes,
    expenses: state.expenses,
    trayHistory: state.trayHistory,
    reminder: state.reminder,
  };
  const res = await sb.from("aligner_records").upsert({
    user_id: user.id,
    record_date: k,
    wear_seconds: Math.floor(wearMs()/1000),
    off_seconds: Math.floor(off/1000),
    off_count: (p.events || []).filter(e => String(e[0]).includes("off")).length,
    current_tray: state.settings.currentTray,
    total_trays: state.settings.totalTrays,
    tray_start_date: state.settings.trayStartDate,
    chew_seconds: Math.floor((p.chewMs || 0)/1000),
    note: JSON.stringify(payload),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,record_date" });
  if (res.error) console.error("sync failed", res.error);
}

function startClock() {
  setInterval(() => {
    if (chew.running) tickChew();
    const t = $("#chewTime");
    if (t) t.textContent = fmtShort(chew.left);
    if (currentPage === "home") {
      // refresh only the visible time values without full rerender
      const big = $(".big");
      if (big) big.textContent = fmt(wearMs());
    }
  }, 1000);
  setInterval(syncNow, 30000);
}

async function boot() {
  ensurePeriod();
  const session = await sb.auth.getSession();
  user = session.data.session?.user || null;
  if (user) await pullCloud();
  render("home");
  startClock();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=3.0.0").then(r => r.update()).catch(console.warn);
}

boot();
})();
