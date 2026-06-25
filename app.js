
(() => {
'use strict';
const VERSION="5.2.0";
const SUPABASE_URL="https://bceamidjnggzpvumswdg.supabase.co";
const SUPABASE_KEY="sb_publishable_vyHgXa5d0H1q845f5poKcA_6UnXHXkL";
const BUCKET="ortho-photos";
const STORAGE_KEY="yatao_timer_v5";
const GOAL_MS=22*3600*1000, DAY_MS=24*3600*1000;
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const pad=n=>String(n).padStart(2,"0");
const fmt=ms=>{ms=Math.max(0,ms||0);let t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return `${pad(h)}:${pad(m)}:${pad(s)}`};
const fmtShort=ms=>fmt(ms).slice(3);
const dateStr=d=>d.toISOString().slice(0,10);
let user=null,localMode=false,syncTimer=null,currentPage="home",calendarDate=new Date(),realtimeChannel=null,isPullingCloud=false,lastLocalSyncAt=0,chew={left:0,total:0,running:false,last:0};
let state=loadState();
let selectedCalendarKey = periodKey();

function loadState(){
 const now=new Date();
 const d={settings:{brand:"时代天使",totalTrays:42,currentTray:1,daysPerTray:7,trayStartDate:dateStr(now),trayStartTime:"12:00",cycleStartTime:"12:00"},periods:{},notes:[],expenses:[],trayHistory:[],reminder:{offAlertMin:60,trayAlert:true},lastCloudPullAt:null};
 try{
 const saved=Object.assign(d,JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"));
 saved.settings.treatmentStartDate ||= saved.settings.trayStartDate || dateStr(new Date());
 saved.settings.treatmentStartTime ||= saved.settings.trayStartTime || "12:00";
 return saved
}catch{return d}
}
function persist(schedule=true){localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); if(schedule)syncLater()}
function cycleStartFor(now=new Date()){let [h,m]=(state.settings.cycleStartTime||"12:00").split(":").map(Number),s=new Date(now);s.setHours(h||0,m||0,0,0);if(now<s)s.setDate(s.getDate()-1);return s}
function periodKey(now=new Date()){return dateStr(cycleStartFor(now))}
function ensurePeriod(k=periodKey()){state.periods[k]||={offMs:0,isWearing:true,lastChange:Date.now(),events:[],chewMs:0};return state.periods[k]}
function period(){return ensurePeriod(periodKey())}
function cycleElapsedMs(k=periodKey()){if(k===periodKey())return Math.max(0,Math.min(DAY_MS,Date.now()-cycleStartFor().getTime()));return DAY_MS}
function offMs(k=periodKey()){const p=ensurePeriod(k);let ms=p.offMs||0;if(k===periodKey()&&!p.isWearing)ms+=Date.now()-p.lastChange;return ms}
function wearMs(k=periodKey()){return Math.max(0,cycleElapsedMs(k)-offMs(k))}
function trayStart(){let s=state.settings;return new Date(`${s.trayStartDate}T${s.trayStartTime||"12:00"}:00`)}
function nextTrayDate(){let d=trayStart();d.setDate(d.getDate()+Number(state.settings.daysPerTray||7));return d}
function treatmentStart(){
 let s=state.settings;
 return new Date(`${s.treatmentStartDate||s.trayStartDate}T${s.treatmentStartTime||s.trayStartTime||"12:00"}:00`);
}
function totalTreatmentDays(){
 const diff=Date.now()-treatmentStart().getTime();
 return Math.max(0,Math.floor(diff/DAY_MS)+1);
}
function dayHour(ms){ms=Math.max(0,ms||0);return `${Math.floor(ms/DAY_MS)} 天 ${Math.floor((ms%DAY_MS)/3600000)} 小时`}
function streak(){
 let n=0;
 const today=periodKey();
 const keys=Object.keys(state.periods).sort().reverse();
 for(let k of keys){
   // 当前周期还没结束时，如果还没到22小时，不应该把连续达标清零
   if(k===today && cycleElapsedMs(k)<DAY_MS && wearMs(k)<GOAL_MS) continue;
   if(wearMs(k)>=GOAL_MS)n++;
   else break;
 }
 return n
}
function avg(days){let ks=Object.keys(state.periods).sort().slice(-days),sum=0,ok=0;ks.forEach(k=>{let h=wearMs(k)/3600000;sum+=h;if(h>=22)ok++});return {keys:ks,avg:ks.length?sum/ks.length:0,ok,total:ks.length}}
function offIntervalsForPeriod(p){let events=p.events||[],arr=[],open=null;for(let ev of events){if(ev[0]==="off")open=ev[1];else if(ev[0]==="on"&&open){arr.push({start:open,end:ev[1],ms:ev[1]-open,type:"auto"});open=null}else if(ev[0]==="manual_off")arr.push({start:ev[1],end:ev[2],ms:ev[3],type:"manual"})}if(open)arr.push({start:open,end:Date.now(),ms:Date.now()-open,type:"current"});return arr.sort((a,b)=>a.start-b.start)}
function timeHM(ts){let d=new Date(ts);return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function dateTimeLocalValue(ts){let d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}

function render(page=currentPage){
  const canUse = !!user || localMode;
  currentPage = canUse ? page : "login";
  ensurePeriod();

  if(!canUse){
    $("#app").innerHTML=`<div class="wrap"><div class="top"><h1>牙套时间管家</h1><div class="muted">请先登录</div></div>${authCard()}</div>`;
    bind();
    return;
  }

  $("#app").innerHTML=`<div class="wrap"><div class="top"><h1>牙套时间管家</h1><div class="muted">${user?"云同步开启":"本地模式"}</div></div>${user?accountCard():localCard()}<main>${pageHtml(page)}</main><nav class="tabs">${tab("home","首页",page)}${tab("calendar","日历",page)}${tab("stats","统计",page)}${tab("tray","牙套",page)}${tab("diary","日记",page)}${tab("more","更多",page)}</nav></div>`;
  bind();
  if(page==="stats")drawChart(7);
}
function tab(k,l,p){return `<button class="tab ${p===k?"active":""}" data-page="${k}">${l}</button>`}
function authCard(){return `<div class="card"><h2>云同步登录</h2><p class="muted">邮箱登录后同步到 Supabase，换手机也能恢复。</p><input id="email" type="email" placeholder="邮箱"><br><br><input id="pwd" type="password" placeholder="密码，至少6位"><div class="btn2"><button id="signup">注册</button><button id="signin" class="green">登录</button></div><button id="local" class="black" style="width:100%;margin-top:12px">暂时本地使用</button><p id="msg" class="muted"></p></div>`}
function accountCard(){return `<div class="card"><div class="row"><b>账号</b><span class="muted">${user.email||""}</span></div><div class="row"><b>实时同步</b><span class="muted" id="rtStatus">已开启</span></div><div class="btn2"><button id="pull" class="gray">读取云端</button><button id="signout" class="black">退出登录</button></div></div>`}
function localCard(){return `<div class="card"><div class="row"><b>模式</b><span class="muted">本地使用，未云同步</span></div><button id="backLogin" class="black" style="width:100%">返回登录</button></div>`}
function pageHtml(p){return ({home:homeHtml,calendar:calendarHtml,stats:statsHtml,tray:trayHtml,diary:diaryHtml,more:moreHtml}[p]||homeHtml)()}

function homeHtml(){
  let p=period(),start=cycleStartFor(),end=new Date(start.getTime()+DAY_MS),
      wear=wearMs(),off=offMs(),pct=Math.min(100,wear/GOAL_MS*100),
      cur=p.isWearing?0:Date.now()-p.lastChange,
      offCount=(p.events||[]).filter(e=>String(e[0]).includes("off")).length,
      remain=7200000-off,
      trayPct=Math.min(100,Math.round((state.settings.currentTray-1)/state.settings.totalTrays*100));

  return `<section class="pinkHero">
    <div class="heroTop">
      <div>
        <div class="heroTitle">牙套时间管家</div>
        <div class="heroSub">好好佩戴 · 早日毕业 ✨</div>
      </div>
      <div class="cloudPill">☁️ ${user?"云同步":"本地"}</div>
    </div>
    <div class="toothFloat">🦷</div>
  </section>

  <div class="card heroCard">
    <div class="sub">今天已佩戴</div>
    <div class="heroTime">${fmt(wear)}</div>
    <div class="progress bigProgress"><div class="bar pinkBar" style="width:${pct}%"></div></div>
    <div class="heroMeta">
      <span>22 / 24 小时</span>
      <b class="${wear>=GOAL_MS?"okText":"warnText"}">${wear>=GOAL_MS?"达标 ✓":"距离达标 "+fmt(GOAL_MS-wear)}</b>
    </div>
    <div class="btn2 heroButtons">
      <button id="markOff" class="red" ${!p.isWearing?"disabled":""}>摘下牙套</button>
      <button id="markOn" class="green" ${p.isWearing?"disabled":""}>戴回牙套</button>
    </div>
  </div>

  <div class="card compactCard">
    <div class="sectionHead">
      <h2>今日摘下记录</h2>
      <span class="muted">${offCount} 次</span>
    </div>
    <div>${recordsForKey(periodKey())}</div>
  </div>

  <div class="card compactCard">
    <div class="sectionHead"><h2>补记摘下时间</h2><span class="muted">忘记记录时使用</span></div>
    <input id="manualEditIndex" type="hidden"><input id="manualEditKey" type="hidden">
    <label>摘下时间</label><input id="manualStart" type="datetime-local">
    <br><br>
    <label>戴回时间</label><input id="manualEnd" type="datetime-local">
    <br><br>
    <div class="btn2"><button id="manualAdd" class="green">保存补记</button><button id="manualCancel" class="gray hidden">取消修改</button></div>
  </div>

  <div class="card compactCard">
    <h2>今日概览</h2>
    <div class="summaryGrid">
      <div class="summaryItem"><span>今日摘下</span><b>${fmt(off)}</b></div>
      <div class="summaryItem"><span>剩余可摘</span><b class="${remain>=0?"okText":"dangerText"}">${remain>=0?fmt(remain):"超 "+fmt(-remain)}</b></div>
      <div class="summaryItem"><span>摘下次数</span><b>${offCount} 次</b></div>
      <div class="summaryItem"><span>连续达标</span><b>${streak()} 天 🔥</b></div>
      <div class="summaryItem"><span>总共佩戴</span><b>${totalTreatmentDays()} 天</b></div>
      <div class="summaryItem"><span>当前牙套</span><b>第 ${state.settings.currentTray} 副</b></div>
    </div>
    <div class="miniTray">
      <span>整体进度 ${trayPct}%</span>
      <div class="progress"><div class="bar pinkBar" style="width:${trayPct}%"></div></div>
    </div>
  </div>

  <div class="card chewCard">
    <div class="sectionHead"><h2>咬胶计时器</h2><span class="muted">今日累计 ${fmt(p.chewMs||0)}</span></div>
    <div class="chewLayout">
      <div>
        <div class="chewTime" id="chewTime">${fmtShort(chew.left)}</div>
        <div class="minuteControl">
          <button id="chewMinus" class="roundBtn" type="button">−</button>
          <input id="chewMinutes" type="number" min="1" step="1" value="${chew.total?Math.max(1,Math.round(chew.total/60000)):5}">
          <button id="chewPlus" class="roundBtn" type="button">＋</button>
        </div>
      </div>
      <div class="chewActions">
        <button id="chewStart" class="green">开始</button>
        <button id="chewPause" class="yellow">暂停</button>
        <button id="chewReset" class="gray">重置</button>
      </div>
    </div>
  </div>`;
}

function calendarHtml(){let y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),startDay=(first.getDay()+6)%7;let cells=[];for(let i=0;i<startDay;i++)cells.push(`<div class="dayCell empty"></div>`);for(let d=1;d<=last.getDate();d++){let dt=new Date(y,m,d),k=dateStr(dt),p=state.periods[k],wear=p?wearMs(k):0,cls=p?(wear>=GOAL_MS?"ok":"bad"):"zero",today=k===dateStr(new Date())?"today":"";cells.push(`<div class="dayCell ${cls} ${today}" data-day="${k}">${d}<span class="mini">${p?(wear/3600000).toFixed(1)+"h":""}</span></div>`)}let selected=selectedCalendarKey||periodKey();return `<div class="card"><div class="calendarHead"><button id="prevMonth" class="gray">‹</button><h2>${y} 年 ${m+1} 月</h2><button id="nextMonth" class="gray">›</button></div><div class="calendarGrid">${["一","二","三","四","五","六","日"].map(w=>`<div class="weekday">${w}</div>`).join("")}${cells.join("")}</div></div><div class="card"><h2 id="dayTitle">${selected} 摘下记录</h2><div id="dayRecords">${recordsForKey(selected)}</div></div><div class="card"><h2>手动补记</h2><input id="manualEditIndex" type="hidden"><input id="manualEditKey" type="hidden"><label>摘下时间</label><input id="manualStart" type="datetime-local"><br><br><label>戴回时间</label><input id="manualEnd" type="datetime-local"><br><br><div class="btn2"><button id="manualAdd" class="green">添加补记</button><button id="manualCancel" class="gray hidden">取消修改</button></div></div>`}
function recordsForKey(k){
  selectedCalendarKey = k;
  let p=ensurePeriod(k),list=offIntervalsForPeriod(p);
  if(!list.length)return `<p class="muted">暂无摘下记录</p>`;
  let totalMin = list.reduce((s,it)=>s+Math.round((it.ms||0)/60000),0);
  return `<p class="muted">共 ${list.length} 次，摘下 ${Math.floor(totalMin/60) ? Math.floor(totalMin/60)+" 小时 " : ""}${totalMin%60} 分钟</p>` + list.map((it,i)=>`
    <div class="swipeRow" data-index="${i}">
      <div class="swipeActions">
        <button class="editAction editOffRecord" data-index="${i}">✎ 修改</button>
        <button class="deleteAction deleteOffRecord" data-index="${i}">🗑 删除</button>
      </div>
      <div class="swipeContent">
        <span>${timeHM(it.start)} ~ ${timeHM(it.end)} ｜ 摘下 ${Math.round(it.ms/60000)} 分钟${it.type==="current"?"（进行中）":""}</span>
        <span class="chevron">›</span>
      </div>
    </div>
  `).join("") + `<p class="muted" style="margin-top:10px">提示：向左滑动记录，可修改或删除。</p>`;
}

function statsHtml(){let a7=avg(7);return `<div class="card"><h2 class="center">统计</h2><div class="seg"><button class="range active" data-days="7">每日</button><button class="range" data-days="28">每周</button><button class="range" data-days="90">每月</button></div><div class="center"><span class="dot"></span>${state.settings.brand||"时代天使"}</div><div class="rangeText" id="rangeText">最近7周期</div><div class="chartCard"><canvas id="chart" width="500" height="300"></canvas></div><div class="ringBox"><div><div class="ring" id="ring7"><div><b id="avg7">0</b><span>小时</span></div></div><div class="ringLabel">7天平均</div></div><div><div class="ring" id="ring30"><div><b id="avg30">0</b><span>小时</span></div></div><div class="ringLabel">30天平均</div></div></div><div class="grid2" style="margin-top:12px"><div class="stat"><div class="muted">连续达标</div><b>${streak()}天</b></div><div class="stat"><div class="muted">最近7天达标</div><b>${a7.ok} / ${a7.total||7}</b></div></div></div>`}

function trayHtml(){let s=state.settings,progress=Math.round((s.currentTray-1)/s.totalTrays*100),left=nextTrayDate()-new Date();return `<div class="card"><h2>牙套进度</h2><div class="row"><b>品牌</b><span>${s.brand||"时代天使"}</span></div><div class="row"><b>总共佩戴</b><span>${totalTreatmentDays()} 天</span></div><div class="row"><b>当前</b><span>第 ${s.currentTray} / ${s.totalTrays} 副</span></div><div class="progress"><div class="bar" style="width:${progress}%"></div></div><div class="sub">整体进度 ${progress}%</div><div class="row"><b>换牙套倒计时</b><span>${left<=0?"可以换牙套了":dayHour(left)}</span></div><div class="row"><b>本副已佩戴</b><span>${dayHour(Date.now()-trayStart())}</span></div><button id="nextTrayBtn" class="green">记录已换到下一副</button></div><div class="card"><h2>牙套设置</h2><label>品牌</label><input id="brand" value="${s.brand||"时代天使"}"><br><br><label>开始佩戴牙套日期</label><input id="treatmentStartDate" type="date" value="${s.treatmentStartDate||s.trayStartDate}"><br><br><label>开始佩戴牙套时间</label><input id="treatmentStartTime" type="time" value="${s.treatmentStartTime||s.trayStartTime||"12:00"}"><br><br><label>总副数</label><input id="totalTrays" type="number" value="${s.totalTrays}"><br><br><label>当前第几副</label><input id="currentTray" type="number" value="${s.currentTray}"><br><br><label>每副佩戴天数</label><input id="daysPerTray" type="number" value="${s.daysPerTray}"><br><br><label>本副开始日期</label><input id="trayStartDate" type="date" value="${s.trayStartDate}"><br><br><label>本副开始时间</label><input id="trayStartTime" type="time" value="${s.trayStartTime}"><br><br><label>每日周期开始时间</label><input id="cycleStartTime" type="time" value="${s.cycleStartTime}"><br><br><button id="saveTray" class="green">保存设置</button></div><div class="card"><h2>换牙套历史</h2>${state.trayHistory.map(h=>`<div class="row"><span>第${h.from} → 第${h.to}副</span><span class="muted">${h.at}</span></div>`).join("")||'<p class="muted">暂无记录</p>'}</div>`}

function diaryHtml(){
  return `<div class="card"><h2>图文日记</h2>
  <input id="noteEditId" type="hidden">
  <textarea id="noteText" placeholder="记录酸痛、黑三角、牙龈、附件、复诊等"></textarea><br><br>
  <label>标签</label><select id="noteTag"><option>普通记录</option><option>黑三角</option><option>疼痛</option><option>磨嘴</option><option>附件</option><option>复诊</option><option>IPR</option></select><br><br>
  <label>上传照片，可多选</label><input id="notePhotos" type="file" accept="image/*" multiple>
  <p class="muted">修改文字/标签时不需要重新上传照片；如果选择新照片，会追加到这条日记。</p>
  <div class="btn2"><button id="saveNote" class="green">保存日记</button><button id="cancelNoteEdit" class="gray hidden">取消修改</button></div>
  </div><div class="card"><h2>日记记录</h2>${state.notes.map(n=>`<div class="row" style="display:block">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
      <div><span class="pill">${n.tag||"普通记录"}</span> <b>第${n.tray}副</b> ${n.text||""}<div class="muted">${n.at}${n.editedAt?"　已修改":""}</div></div>
      <div style="white-space:nowrap"><button class="gray smallBtn editNote" data-id="${n.id}">修改</button><button class="red smallBtn deleteNote" data-id="${n.id}">删除</button></div>
    </div>
    <div class="thumbGrid">${(n.photos||[]).map(p=>`<img class="thumb" src="${p.url}">`).join("")}</div>
  </div>`).join("")||'<p class="muted">暂无日记</p>'}</div>`
}

function moreHtml(){let total=state.expenses.reduce((s,e)=>s+Number(e.amount||0),0);return `<div class="card"><h2>支出记录</h2><input id="expenseEditId" type="hidden"><input id="expenseAmount" type="number" step="0.01" placeholder="金额"><br><br><select id="expenseCategory"><option>正畸费用</option><option>复诊</option><option>清洁护理</option><option>牙线/冲牙器</option><option>保持器</option><option>交通</option><option>其他</option></select><br><br><input id="expenseDate" type="date" value="${dateStr(new Date())}"><br><br><input id="expenseNote" placeholder="备注"><br><br><div class="btn2"><button id="saveExpense" class="green">保存支出</button><button id="cancelExpenseEdit" class="gray hidden">取消修改</button></div></div><div class="card"><h2>支出统计</h2><div class="muted center">累计支出</div><div class="expenseTotal">¥${total.toFixed(2)}</div>${state.expenses.map(e=>`<div class="row" style="align-items:flex-start"><span><span class="pill">${e.category}</span> ${e.note||""}<br><span class="muted">${e.date}</span></span><span style="text-align:right"><b>¥${Number(e.amount).toFixed(2)}</b><br><button class="gray smallBtn editExpense" data-id="${e.id}">修改</button><button class="red smallBtn deleteExpense" data-id="${e.id}">删除</button></span></div>`).join("")||'<p class="muted">暂无支出</p>'}</div><div class="card"><h2>提醒设置</h2><label>摘下超过提醒</label><select id="offAlert"><option value="30" ${state.reminder.offAlertMin==30?"selected":""}>30分钟</option><option value="60" ${state.reminder.offAlertMin==60?"selected":""}>60分钟</option><option value="90" ${state.reminder.offAlertMin==90?"selected":""}>90分钟</option></select><br><br><button id="saveRemind" class="green">保存提醒</button></div>`}


function bindSwipeRows(){
  $$(".swipeRow").forEach(row=>{
    let startX=0, currentX=0;
    row.addEventListener("touchstart",e=>{startX=e.touches[0].clientX;currentX=startX;},{passive:true});
    row.addEventListener("touchmove",e=>{
      currentX=e.touches[0].clientX;
      const dx=currentX-startX;
      if(dx< -20){row.classList.add("open")}
      if(dx> 20){row.classList.remove("open")}
    },{passive:true});
    row.addEventListener("click",e=>{
      if(e.target.tagName==="BUTTON")return;
      $$(".swipeRow").forEach(r=>{if(r!==row)r.classList.remove("open")});
      row.classList.toggle("open");
    });
  });
}

function bind(){$$(".tab").forEach(b=>b.onclick=()=>render(b.dataset.page));if($("#signup")){$("#signup").onclick=signUp;$("#signin").onclick=signIn;$("#local").onclick=()=>{localMode=true;render("home")}}if($("#signout"))$("#signout").onclick=signOut;if($("#backLogin"))$("#backLogin").onclick=()=>{localMode=false;render("login")};if($("#pull"))$("#pull").onclick=async()=>{let ok=await pullCloud({manual:true});render(currentPage);if(ok)alert("已同步最新数据")};if($("#markOff"))$("#markOff").onclick=markOff;if($("#markOn"))$("#markOn").onclick=markOn;if($("#chewStart"))$("#chewStart").onclick=()=>startChew(Number($("#chewMinutes").value||5)*60);if($("#chewMinus"))$("#chewMinus").onclick=()=>{$("#chewMinutes").value=Math.max(1,Number($("#chewMinutes").value||5)-1)};if($("#chewPlus"))$("#chewPlus").onclick=()=>{$("#chewMinutes").value=Number($("#chewMinutes").value||5)+1};if($("#chewPause"))$("#chewPause").onclick=pauseChew;if($("#chewReset"))$("#chewReset").onclick=()=>{chew={left:0,total:0,running:false,last:0};render("home")};if($("#manualAdd"))$("#manualAdd").onclick=manualAdd;if($("#manualCancel"))$("#manualCancel").onclick=cancelManualEdit;$$(".editOffRecord").forEach(b=>b.onclick=()=>editOffRecord(Number(b.dataset.index)));$$(".deleteOffRecord").forEach(b=>b.onclick=()=>deleteOffRecord(Number(b.dataset.index)));bindSwipeRows();$$(".dayCell[data-day]").forEach(b=>b.onclick=()=>selectCalendarDay(b.dataset.day));if($("#prevMonth"))$("#prevMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);render("calendar")};if($("#nextMonth"))$("#nextMonth").onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);render("calendar")};$$(".range").forEach(b=>b.onclick=()=>{$$(".range").forEach(x=>x.classList.remove("active"));b.classList.add("active");drawChart(Number(b.dataset.days))});if($("#saveTray"))$("#saveTray").onclick=saveTray;if($("#nextTrayBtn"))$("#nextTrayBtn").onclick=nextTrayClick;if($("#saveNote"))$("#saveNote").onclick=saveNote;
if($("#cancelNoteEdit"))$("#cancelNoteEdit").onclick=cancelNoteEdit;
$$(".editNote").forEach(b=>b.onclick=()=>editNote(b.dataset.id));
$$(".deleteNote").forEach(b=>b.onclick=()=>deleteNote(b.dataset.id));if($("#saveExpense"))$("#saveExpense").onclick=saveExpense;if($("#cancelExpenseEdit"))$("#cancelExpenseEdit").onclick=cancelExpenseEdit;$$(".editExpense").forEach(b=>b.onclick=()=>editExpense(b.dataset.id));$$(".deleteExpense").forEach(b=>b.onclick=()=>deleteExpense(b.dataset.id));if($("#saveRemind"))$("#saveRemind").onclick=saveRemind}

function markOff(){let p=period();if(!p.isWearing)return;p.isWearing=false;p.lastChange=Date.now();p.events.push(["off",Date.now()]);persist();render("home")}
function markOn(){let p=period();if(p.isWearing)return;p.offMs+=Date.now()-p.lastChange;p.isWearing=true;p.lastChange=Date.now();p.events.push(["on",Date.now()]);persist();render("home")}
function startChew(sec){if(!sec||sec<=0)return alert("请输入正确的咬胶时间");chew={left:sec*1000,total:sec*1000,running:true,last:Date.now()}}
function pauseChew(){if(chew.running){tickChew();chew.running=false}else if(chew.left>0){chew.running=true;chew.last=Date.now()}}
function tickChew(){if(!chew.running)return;let now=Date.now(),used=now-chew.last;chew.left-=used;chew.last=now;period().chewMs=(period().chewMs||0)+used;if(chew.left<=0){chew.left=0;chew.running=false;alert("咬胶完成")}persist()}

function manualAdd(){
  let s=new Date($("#manualStart").value),e=new Date($("#manualEnd").value);
  if(isNaN(s)||isNaN(e)||e<=s)return alert("请填写正确时间");
  let editIdx=$("#manualEditIndex")?.value;
  let k=$("#manualEditKey")?.value || selectedCalendarKey || periodKey();
  let p=ensurePeriod(k), ms=e-s;

  if(editIdx!==""){
    let old=offIntervalsForPeriod(p)[Number(editIdx)];
    if(!old) return alert("没有找到要修改的记录");

    if(old.type==="manual"){
      let pos=p.events.findIndex(ev=>ev[0]==="manual_off"&&ev[1]===old.start&&ev[2]===old.end);
      if(pos>=0){
        p.offMs=Math.max(0,(p.offMs||0)-(old.ms||0)+ms);
        p.events[pos]=["manual_off",s.getTime(),e.getTime(),ms];
      }
    }else if(old.type==="auto"){
      let offPos=p.events.findIndex(ev=>ev[0]==="off"&&ev[1]===old.start);
      let onPos=p.events.findIndex(ev=>ev[0]==="on"&&ev[1]===old.end);
      if(offPos>=0&&onPos>=0){
        p.offMs=Math.max(0,(p.offMs||0)-(old.ms||0)+ms);
        p.events[offPos]=["off",s.getTime()];
        p.events[onPos]=["on",e.getTime()];
      }
    }else{
      return alert("正在进行中的摘下记录，戴回后再修改");
    }
  }else{
    p.offMs+=ms;
    p.events.push(["manual_off",s.getTime(),e.getTime(),ms]);
  }
  persist();
  render("calendar");
}

function getManualEvents(k=selectedCalendarKey){return ensurePeriod(k).events.filter(e=>e[0]==="manual_off")}

function editOffRecord(i){
  let k = selectedCalendarKey || periodKey();
  let p = ensurePeriod(k);
  let it = offIntervalsForPeriod(p)[i];
  if(!it || it.type==="current") return alert("正在进行中的摘下记录，戴回后再修改");

  $("#manualStart").value = dateTimeLocalValue(it.start);
  $("#manualEnd").value = dateTimeLocalValue(it.end);
  $("#manualAdd").textContent = "保存修改";
  $("#manualCancel").classList.remove("hidden");
  $("#manualEditIndex").value = i;
  $("#manualEditKey").value = k;
  window.scrollTo({top: document.body.scrollHeight, behavior:"smooth"});
}

function deleteOffRecord(i){
  let k = selectedCalendarKey || periodKey();
  let p = ensurePeriod(k);
  let it = offIntervalsForPeriod(p)[i];
  if(!it || it.type==="current") return alert("正在进行中的摘下记录，戴回后再删除");
  if(!confirm(`确定删除这条摘下记录吗？\n${timeHM(it.start)} ~ ${timeHM(it.end)}，${Math.round(it.ms/60000)} 分钟`))return;

  if(it.type==="manual"){
    let pos=p.events.findIndex(e=>e[0]==="manual_off"&&e[1]===it.start&&e[2]===it.end);
    if(pos>=0){
      p.offMs=Math.max(0,(p.offMs||0)-(p.events[pos][3]||0));
      p.events.splice(pos,1);
    }
  }else{
    let offPos=p.events.findIndex(e=>e[0]==="off"&&e[1]===it.start);
    let onPos=p.events.findIndex(e=>e[0]==="on"&&e[1]===it.end);
    if(offPos>=0 && onPos>=0){
      p.offMs=Math.max(0,(p.offMs||0)-it.ms);
      p.events.splice(Math.max(offPos,onPos),1);
      p.events.splice(Math.min(offPos,onPos),1);
    }
  }
  persist();
  render("calendar");
}

function cancelManualEdit(){
  $("#manualEditIndex").value="";
  $("#manualEditKey").value="";
  $("#manualStart").value="";
  $("#manualEnd").value="";
  $("#manualAdd").textContent="添加补记";
  $("#manualCancel").classList.add("hidden");
}

function selectCalendarDay(k){let d=new Date(k+"T12:00:00");calendarDate=d;selectedCalendarKey=k;$("#dayTitle").textContent=k+" 摘下记录";$("#dayRecords").innerHTML=recordsForKey(k);bindSwipeRows()}

function saveTray(){state.settings={brand:$("#brand").value||"时代天使",treatmentStartDate:$("#treatmentStartDate").value||$("#trayStartDate").value||dateStr(new Date()),treatmentStartTime:$("#treatmentStartTime").value||$("#trayStartTime").value||"12:00",totalTrays:+$("#totalTrays").value||42,currentTray:+$("#currentTray").value||1,daysPerTray:+$("#daysPerTray").value||7,trayStartDate:$("#trayStartDate").value||dateStr(new Date()),trayStartTime:$("#trayStartTime").value||"12:00",cycleStartTime:$("#cycleStartTime").value||"12:00"};persist();render("tray")}
function nextTrayClick(){let s=state.settings;if(s.currentTray>=s.totalTrays)return alert("已经是最后一副");state.trayHistory.unshift({from:s.currentTray,to:s.currentTray+1,at:new Date().toLocaleString()});s.currentTray++;let n=new Date();s.trayStartDate=dateStr(n);s.trayStartTime=`${pad(n.getHours())}:${pad(n.getMinutes())}`;persist();render("tray")}
function saveExpense(){let amount=Number($("#expenseAmount").value);if(!amount||amount<=0)return alert("请输入金额");let id=$("#expenseEditId").value,item={id:id?Number(id):Date.now(),amount,category:$("#expenseCategory").value,date:$("#expenseDate").value||dateStr(new Date()),note:$("#expenseNote").value.trim(),at:new Date().toLocaleString()};if(id){let i=state.expenses.findIndex(e=>Number(e.id)===Number(id));if(i>=0)state.expenses[i]={...state.expenses[i],...item,editedAt:new Date().toLocaleString()}}else state.expenses.unshift(item);persist();render("more")}
function editExpense(id){let e=state.expenses.find(x=>Number(x.id)===Number(id));if(!e)return;$("#expenseEditId").value=e.id;$("#expenseAmount").value=e.amount;$("#expenseCategory").value=e.category;$("#expenseDate").value=e.date;$("#expenseNote").value=e.note||"";$("#saveExpense").textContent="保存修改";$("#cancelExpenseEdit").classList.remove("hidden")}
function cancelExpenseEdit(){$("#expenseEditId").value="";$("#expenseAmount").value="";$("#expenseNote").value="";$("#expenseDate").value=dateStr(new Date());$("#saveExpense").textContent="保存支出";$("#cancelExpenseEdit").classList.add("hidden")}
function deleteExpense(id){let e=state.expenses.find(x=>Number(x.id)===Number(id));if(!e)return;if(!confirm(`确定删除这笔支出吗？\n${e.category} ${e.note||""} ¥${Number(e.amount).toFixed(2)}`))return;state.expenses=state.expenses.filter(x=>Number(x.id)!==Number(id));persist();render("more")}
function saveRemind(){state.reminder.offAlertMin=Number($("#offAlert").value);persist();alert("已保存")}

async function compressImage(file){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=e=>{let img=new Image();img.onload=()=>{let scale=Math.min(1,1200/img.width),c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?resolve(b):reject(new Error("压缩失败")),"image/jpeg",.8)};img.onerror=reject;img.src=e.target.result};r.onerror=reject;r.readAsDataURL(file)})}
function blobToDataUrl(blob){return new Promise(res=>{let r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob)})}
async function saveNote(){
  let text=$("#noteText").value.trim(),tag=$("#noteTag").value,files=Array.from($("#notePhotos").files||[]);
  let editId=$("#noteEditId")?.value;
  if(!text&&!files.length)return alert("请填写日记或上传照片");

  let photos=[];
  for(let f of files){
    let blob=await compressImage(f);
    if(user){
      let path=`${user.id}/tray_${state.settings.currentTray}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
      up=await sb.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:true});
      if(up.error){alert("照片上传失败："+up.error.message);continue}
      let pub=sb.storage.from(BUCKET).getPublicUrl(path);
      photos.push({url:pub.data.publicUrl,path})
    }else photos.push({url:await blobToDataUrl(blob),local:true})
  }

  if(editId){
    let i=state.notes.findIndex(n=>Number(n.id)===Number(editId));
    if(i>=0){
      state.notes[i]={
        ...state.notes[i],
        tag,
        text,
        photos:[...(state.notes[i].photos||[]),...photos],
        editedAt:new Date().toLocaleString()
      };
    }
  }else{
    state.notes.unshift({id:Date.now(),tray:state.settings.currentTray,period:periodKey(),tag,text,photos,at:new Date().toLocaleString()})
  }
  persist();
  render("diary")
}

function editNote(id){
  let n=state.notes.find(x=>Number(x.id)===Number(id));
  if(!n)return;
  $("#noteEditId").value=n.id;
  $("#noteText").value=n.text||"";
  $("#noteTag").value=n.tag||"普通记录";
  $("#saveNote").textContent="保存修改";
  $("#cancelNoteEdit").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
}

function cancelNoteEdit(){
  $("#noteEditId").value="";
  $("#noteText").value="";
  $("#noteTag").value="普通记录";
  $("#notePhotos").value="";
  $("#saveNote").textContent="保存日记";
  $("#cancelNoteEdit").classList.add("hidden");
}

async function deleteNote(id){
  let n=state.notes.find(x=>Number(x.id)===Number(id));
  if(!n)return;
  if(!confirm(`确定删除这条日记吗？\n${n.text||""}`))return;

  // 尝试删除 Storage 中的照片；如果失败，不影响删除日记文字
  if(user && n.photos && n.photos.length){
    const paths=n.photos.map(p=>p.path).filter(Boolean);
    if(paths.length) await sb.storage.from(BUCKET).remove(paths);
  }

  state.notes=state.notes.filter(x=>Number(x.id)!==Number(id));
  persist();
  render("diary");
}


function drawChart(days=7){let s=avg(days),s7=avg(7),s30=avg(30);$("#avg7").textContent=s7.avg.toFixed(1);$("#avg30").textContent=s30.avg.toFixed(1);setRing("ring7",s7.avg);setRing("ring30",s30.avg);if(s.keys.length)$("#rangeText").textContent=`${s.keys[0].replaceAll("-","/")} - ${s.keys.at(-1).replaceAll("-","/")}`;let cv=$("#chart");if(!cv)return;let ctx=cv.getContext("2d");ctx.clearRect(0,0,500,300);let L=42,T=30,W=430,H=210,y20=T+H-(20/24)*H;ctx.strokeStyle="#74c982";ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(L,y20);ctx.lineTo(L+W,y20);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#777";ctx.font="14px sans-serif";ctx.fillText("24",8,T+6);ctx.fillText("0",14,T+H);ctx.fillStyle="#74c982";ctx.fillText("20",L+W-5,y20-8);let pts=s.keys.map((k,i)=>{let h=wearMs(k)/3600000;return {x:L+(s.keys.length===1?W/2:i*W/(s.keys.length-1)),y:T+H-Math.min(24,h)/24*H,h,k}});if(pts.length>1){ctx.strokeStyle="#74c982";ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke()}pts.forEach(p=>{ctx.fillStyle=p.h>=22?"#74c982":"#ffb020";ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#5b9f62";ctx.fillText(p.h.toFixed(1),p.x-12,p.y-18);ctx.fillStyle="#888";let d=new Date(p.k+"T00:00:00");ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,p.x-14,T+H+28)})}
function setRing(id,val){let el=$("#"+id);if(!el)return;let deg=Math.min(360,val/24*360);el.style.background=`conic-gradient(var(--green) 0deg,var(--green) ${deg}deg,#e9f6ec ${deg}deg)`}

async function signUp(){let msg=$("#msg");msg.textContent="注册中...";let r=await sb.auth.signUp({email:$("#email").value.trim(),password:$("#pwd").value});msg.textContent=r.error?"注册失败："+r.error.message:"注册成功，请登录或查看邮箱验证"}
async function signIn(){let msg=$("#msg");msg.textContent="登录中...";let r=await sb.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#pwd").value});if(r.error)return msg.textContent="登录失败："+r.error.message;user=r.data.user;localMode=false;await pullCloud({manual:false});setupRealtime();render("home")}
async function signOut(){await syncNow();if(realtimeChannel){await sb.removeChannel(realtimeChannel);realtimeChannel=null}await sb.auth.signOut();user=null;localMode=false;render("login")}
async function pullCloud({manual=false}={}){
  if(!user)return false;
  if(isPullingCloud)return false;
  isPullingCloud=true;

  const r=await sb.from("aligner_records").select("*").eq("user_id",user.id).order("updated_at",{ascending:true});
  if(r.error){
    isPullingCloud=false;
    if(manual)alert("读取云端失败："+r.error.message);
    return false;
  }

  for(let row of r.data||[]){
    try{
      const remote=JSON.parse(row.note||"{}");
      // 云端数据按 updated_at 顺序合并；新数据会覆盖旧字段
      state=Object.assign(state,remote);
    }catch{}
  }
  state.lastCloudPullAt=new Date().toISOString();
  persist(false);
  isPullingCloud=false;
  return true;
}

function setupRealtime(){
  if(!user)return;
  if(realtimeChannel)sb.removeChannel(realtimeChannel);

  realtimeChannel=sb
    .channel("aligner_records_realtime_"+user.id)
    .on("postgres_changes",
      {
        event:"*",
        schema:"public",
        table:"aligner_records",
        filter:"user_id=eq."+user.id
      },
      async(payload)=>{
        // 避免自己刚保存后马上收到回推又重复刷新；其它设备的变化会实时拉取
        const ts=payload?.new?.updated_at ? new Date(payload.new.updated_at).getTime() : Date.now();
        if(Date.now()-lastLocalSyncAt<1200 && Math.abs(ts-lastLocalSyncAt)<3000)return;

        const ok=await pullCloud({manual:false});
        if(ok)render(currentPage==="login"?"home":currentPage);
      }
    )
    .subscribe(status=>{
      const el=$("#rtStatus");
      if(el)el.textContent=status==="SUBSCRIBED"?"已开启":"连接中";
      console.log("Realtime:",status);
    });
}
function syncLater(){if(!user)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,1000)}
async function syncNow(){
  if(!user)return;
  let p=period(),k=periodKey(),off=offMs(),
      payload={settings:state.settings,periods:state.periods,notes:state.notes,expenses:state.expenses,trayHistory:state.trayHistory,reminder:state.reminder,lastUpdatedAt:new Date().toISOString()};
  lastLocalSyncAt=Date.now();
  let r=await sb.from("aligner_records").upsert({
    user_id:user.id,
    record_date:k,
    wear_seconds:Math.floor(wearMs()/1000),
    off_seconds:Math.floor(off/1000),
    off_count:(p.events||[]).filter(e=>String(e[0]).includes("off")).length,
    current_tray:state.settings.currentTray,
    total_trays:state.settings.totalTrays,
    tray_start_date:state.settings.trayStartDate,
    chew_seconds:Math.floor((p.chewMs||0)/1000),
    note:JSON.stringify(payload),
    updated_at:new Date().toISOString()
  },{onConflict:"user_id,record_date"});
  if(r.error)console.error("sync failed",r.error)
}

function tick(){if(chew.running)tickChew();let t=$("#chewTime");if(t)t.textContent=fmtShort(chew.left);if(currentPage==="home"){let big=$(".heroTime");if(big)big.textContent=fmt(wearMs())}}
async function boot(){ensurePeriod();let s=await sb.auth.getSession();user=s.data.session?.user||null;if(user){await pullCloud({manual:false});setupRealtime()}render(user?"home":"login");setInterval(tick,1000);setInterval(syncNow,120000);if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js?v=5.2.0").then(r=>r.update()).catch(console.warn)}
boot();
})();
