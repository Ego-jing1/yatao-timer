
const SUPABASE_URL="https://bceamidjnggzpvumswdg.supabase.co";
const SUPABASE_KEY="sb_publishable_vyHgXa5d0H1q845f5poKcA_6UnXHXkL";
const BUCKET="ortho-photos";
const KEY="aligner_official_v1";
const GOAL=22*3600*1000;
let sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null,timer=null,chew={left:0,total:0,running:false,last:0};
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const pad=n=>String(n).padStart(2,"0");
const fmt=ms=>{ms=Math.max(0,ms);let t=Math.floor(ms/1000),h=Math.floor(t/3600),m=Math.floor((t%3600)/60),s=t%60;return `${pad(h)}:${pad(m)}:${pad(s)}`}
const dateStr=d=>d.toISOString().slice(0,10);
let state=load();

function load(){
  let now=new Date();
  let d=JSON.parse(localStorage.getItem(KEY)||"{}");
  d.settings ||= {totalTrays:42,currentTray:1,daysPerTray:7,trayStartDate:dateStr(now),trayStartTime:"12:00",cycleStartTime:"12:00",brand:"时代天使"};
  d.periods ||= {};
  d.notes ||= [];
  d.expenses ||= [];
  d.trayHistory ||= [];
  d.reminder ||= {offAlertMin:60,trayAlert:true};
  return d;
}
function save(){localStorage.setItem(KEY,JSON.stringify(state)); syncLater();}
function cycleStartFor(now=new Date()){let [h,m]=(state.settings.cycleStartTime||"12:00").split(":").map(Number);let s=new Date(now);s.setHours(h,m,0,0);if(now<s)s.setDate(s.getDate()-1);return s}
function periodKey(now=new Date()){return dateStr(cycleStartFor(now))}
function period(){let k=periodKey();state.periods[k]||={offMs:0,isWearing:true,lastChange:Date.now(),events:[],chewMs:0};return state.periods[k]}
function offMs(k=periodKey()){let p=state.periods[k]||period();let v=p.offMs||0;if(k===periodKey()&&!p.isWearing)v+=Date.now()-p.lastChange;return v}
function wearMs(k=periodKey()){return 86400000-offMs(k)}
function trayStart(){let s=state.settings;return new Date(`${s.trayStartDate}T${s.trayStartTime||"12:00"}:00`)}
function nextTray(){let d=trayStart();d.setDate(d.getDate()+Number(state.settings.daysPerTray||7));return d}
function dayHour(ms){return `${Math.max(0,Math.floor(ms/86400000))} 天 ${Math.max(0,Math.floor((ms%86400000)/3600000))} 小时`}
function streak(){let n=0;for(let k of Object.keys(state.periods).sort().reverse()){if(wearMs(k)>=GOAL)n++;else break}return n}
function avg(days){let ks=Object.keys(state.periods).sort().slice(-days);let sum=0,ok=0;ks.forEach(k=>{let h=wearMs(k)/3600000;sum+=h;if(h>=22)ok++});return {keys:ks,avg:ks.length?sum/ks.length:0,ok,total:ks.length}}

async function boot(){
  let sess=await sb.auth.getSession(); user=sess.data.session?.user||null;
  if(user) await pullCloud();
  render();
  setInterval(tick,1000);
  setInterval(syncNow,30000);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=official1").then(r=>r.update());
}
function shell(page="home"){
  let isAuth=!!user;
  return `<div class="wrap">
    <div class="top"><h1>牙套时间管家</h1><div class="muted">${isAuth?"云同步开启":"未登录"}</div></div>
    ${!isAuth?authHtml():accountHtml()}
    <main id="main">${pageHtml(page)}</main>
    <nav class="tabs">
      ${["home:首页","tray:牙套","stats:统计","diary:日记","expense:支出","remind:提醒"].map(x=>{let [k,v]=x.split(":");return `<button class="tab ${page===k?"active":""}" data-page="${k}">${v}</button>`}).join("")}
    </nav>
  </div>`}
function authHtml(){return `<div class="card"><h2>云同步登录</h2><p class="muted">邮箱登录后同步到 Supabase，换手机也能恢复。</p>
  <input id="email" type="email" placeholder="邮箱"><br><br><input id="pwd" type="password" placeholder="密码，至少6位">
  <div class="btn2"><button id="signup">注册</button><button id="signin" class="green">登录</button></div>
  <button id="local" class="black" style="width:100%;margin-top:12px">暂时本地使用</button><p id="msg" class="muted"></p></div>`}
function accountHtml(){return `<div class="card"><div class="row"><b>账号</b><span class="muted">${user.email}</span></div><button id="signout" class="black">退出登录</button></div>`}
function pageHtml(p){return {home:homeHtml,tray:trayHtml,stats:statsHtml,diary:diaryHtml,expense:expenseHtml,remind:remindHtml}[p]()}
function homeHtml(){
 let p=period(), c=cycleStartFor(), e=new Date(c.getTime()+86400000), off=offMs(), wear=wearMs(), pct=Math.min(100,wear/GOAL*100), cur=!p.isWearing?Date.now()-p.lastChange:0;
 return `<div class="card"><div class="sub">本周期已佩戴</div><div class="big">${fmt(wear)}</div><div class="sub">当前状态：${p.isWearing?"佩戴中":"已摘下"}</div><div class="progress"><div class="bar" style="width:${pct}%"></div></div><div class="sub">目标：22小时 / 24小时周期</div><div class="btn2"><button id="off" class="red" ${!p.isWearing?"disabled":""}>摘下牙套</button><button id="on" class="green" ${p.isWearing?"disabled":""}>戴回牙套</button></div></div>
 <div class="card"><h2>统计周期</h2>
  <div class="row"><b>周期</b><span>${dateStr(c)} ${pad(c.getHours())}:${pad(c.getMinutes())} - ${dateStr(e)} ${pad(e.getHours())}:${pad(e.getMinutes())}</span></div>
  <div class="row"><b>摘下累计</b><span>${fmt(off)}</span></div><div class="row"><b>剩余可摘</b><span>${fmt(7200000-off)}</span></div>
  <div class="row"><b>本次摘下</b><span>${fmt(cur)}</span></div><div class="row"><b>摘下次数</b><span>${(p.events||[]).filter(x=>x[0].includes("off")).length} 次</span></div>
  <div class="row"><b>连续达标</b><span>${streak()} 天</span></div><div class="row"><b>咬胶累计</b><span>${fmt(p.chewMs||0)}</span></div></div>
 <div class="card"><h2>今日事件</h2><div class="timeline">${(p.events||[]).slice(-8).reverse().map(ev=>`<div class="event">${new Date(ev[1]).toLocaleTimeString()}　${ev[0]==="off"?"摘下":ev[0]==="on"?"戴回":"补记摘下"} ${ev[3]?fmt(ev[3]):""}</div>`).join("")||'<p class="muted">暂无事件</p>'}</div></div>
 <div class="card"><h2>咬胶计时器</h2><div class="big" id="chewTime">${fmt(chew.left).slice(3)}</div><div class="btn3"><button data-chew="60">1分钟</button><button data-chew="120">2分钟</button><button data-chew="180">3分钟</button></div><div class="btn2"><button id="chewPause" class="black">暂停/继续</button><button id="chewReset" class="red">重置</button></div></div>
 <div class="card"><h2>手动补记摘下时间</h2><p class="muted">忘记点击时，在这里补记，会加入当前周期。</p><input id="manualStart" type="datetime-local"><br><br><input id="manualEnd" type="datetime-local"><br><br><button id="manualAdd" class="green">添加补记</button></div>`}
function trayHtml(){
 let s=state.settings, progress=Math.round((s.currentTray-1)/s.totalTrays*100), left=nextTray()-new Date();
 return `<div class="card"><h2>牙套进度</h2><div class="row"><b>当前</b><span>第 ${s.currentTray} / ${s.totalTrays} 副</span></div><div class="progress"><div class="bar" style="width:${progress}%"></div></div><div class="sub">整体进度 ${progress}%</div><div class="row"><b>换牙套倒计时</b><span>${left<=0?"可以换牙套了":dayHour(left)}</span></div><div class="row"><b>本副已佩戴</b><span>${dayHour(Date.now()-trayStart())}</span></div><button id="nextTrayBtn" class="green">记录已换到下一副</button></div>
 <div class="card"><h2>牙套设置</h2><label>品牌</label><input id="brand" value="${s.brand||"时代天使"}"><br><br><label>总副数</label><input id="totalTrays" type="number" value="${s.totalTrays}"><br><br><label>当前第几副</label><input id="currentTray" type="number" value="${s.currentTray}"><br><br><label>每副佩戴天数</label><input id="daysPerTray" type="number" value="${s.daysPerTray}"><br><br><label>本副开始日期</label><input id="trayStartDate" type="date" value="${s.trayStartDate}"><br><br><label>本副开始时间</label><input id="trayStartTime" type="time" value="${s.trayStartTime}"><br><br><label>每日周期开始时间</label><input id="cycleStartTime" type="time" value="${s.cycleStartTime}"><br><br><button id="saveTray" class="green">保存设置</button></div>
 <div class="card"><h2>换牙套历史</h2>${state.trayHistory.map(h=>`<div class="row"><span>第${h.from} → 第${h.to}副</span><span class="muted">${h.at}</span></div>`).join("")||'<p class="muted">暂无记录</p>'}</div>`}
function statsHtml(){return `<div class="card"><h2 class="center">统计</h2><div class="seg"><button class="range active" data-days="7">每日</button><button class="range" data-days="28">每周</button><button class="range" data-days="90">每月</button></div><div class="center"><span class="dot"></span>${state.settings.brand||"时代天使"}</div><div class="rangeText" id="rangeText">最近7周期</div><div class="chartCard"><canvas id="chart" width="500" height="300"></canvas></div><div class="ringBox"><div><div class="ring" id="ring7"><div><b id="avg7">0</b><span>小时</span></div></div><div class="ringLabel">7天平均</div></div><div><div class="ring" id="ring30"><div><b id="avg30">0</b><span>小时</span></div></div><div class="ringLabel">30天平均</div></div></div><div class="grid2" style="margin-top:12px"><div class="stat"><div class="muted">连续达标</div><b>${streak()}天</b></div><div class="stat"><div class="muted">最近7天达标</div><b>${avg(7).ok} / ${avg(7).total||7}</b></div></div></div>`}
function diaryHtml(){
 return `<div class="card"><h2>图文日记</h2><textarea id="noteText" placeholder="记录酸痛、黑三角、牙龈、附件、复诊等"></textarea><br><br><label>上传照片，可多选</label><input id="notePhotos" type="file" accept="image/*" multiple><p class="muted">照片会压缩后上传到 Supabase Storage。</p><button id="saveNote" class="green">保存日记</button></div>
 <div class="card"><h2>日记记录</h2>${state.notes.map(n=>`<div class="row" style="display:block"><b>第${n.tray}副</b> ${n.text||""}<div class="muted">${n.at}</div><div class="thumbGrid">${(n.photos||[]).map(p=>`<img class="thumb" src="${p.url}">`).join("")}</div></div>`).join("")||'<p class="muted">暂无日记</p>'}</div>`}
function expenseHtml(){
 let total=state.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
 return `<div class="card"><h2>支出记录</h2><input id="expenseAmount" type="number" step="0.01" placeholder="金额"><br><br><select id="expenseCategory"><option>正畸费用</option><option>复诊</option><option>清洁护理</option><option>牙线/冲牙器</option><option>保持器</option><option>交通</option><option>其他</option></select><br><br><input id="expenseDate" type="date" value="${dateStr(new Date())}"><br><br><input id="expenseNote" placeholder="备注"><br><br><button id="saveExpense" class="green">保存支出</button></div><div class="card"><h2>支出统计</h2><div class="muted center">累计支出</div><div class="expenseTotal">¥${total.toFixed(2)}</div>${state.expenses.map(e=>`<div class="row"><span><span class="pill">${e.category}</span> ${e.note||""}<br><span class="muted">${e.date}</span></span><b>¥${Number(e.amount).toFixed(2)}</b></div>`).join("")||'<p class="muted">暂无支出</p>'}</div>`}
function remindHtml(){return `<div class="card"><h2>提醒设置</h2><p class="muted">网页提醒需打开页面。iPhone 后台通知后续可接入。</p><label>摘下超过提醒</label><select id="offAlert"><option value="30">30分钟</option><option value="60">60分钟</option><option value="90">90分钟</option></select><br><br><button id="saveRemind" class="green">保存提醒</button></div>`}

function render(page="home"){$("#app").innerHTML=shell(page);bind(page);if(page==="stats")drawChart(7)}
function bind(page){
  $$(".tab").forEach(b=>b.onclick=()=>render(b.dataset.page));
  $("#signup")&&( $("#signup").onclick=signUp, $("#signin").onclick=signIn, $("#local").onclick=()=>{user=null;render("home")} );
  $("#signout")&&($("#signout").onclick=signOut);
  $("#off")&&($("#off").onclick=()=>{let p=period();p.isWearing=false;p.lastChange=Date.now();p.events.push(["off",Date.now()]);save();render("home")})
  $("#on")&&($("#on").onclick=()=>{let p=period();p.offMs+=Date.now()-p.lastChange;p.isWearing=true;p.events.push(["on",Date.now()]);save();render("home")})
  $$("[data-chew]").forEach(b=>b.onclick=()=>{chew={left:Number(b.dataset.chew)*1000,total:Number(b.dataset.chew)*1000,running:true,last:Date.now()}})
  $("#chewPause")&&($("#chewPause").onclick=()=>{if(chew.running){tickChew();chew.running=false}else if(chew.left>0){chew.running=true;chew.last=Date.now()}})
  $("#chewReset")&&($("#chewReset").onclick=()=>{chew={left:0,total:0,running:false,last:0};render("home")})
  $("#manualAdd")&&($("#manualAdd").onclick=manualAdd);
  $("#saveTray")&&($("#saveTray").onclick=saveTray);
  $("#nextTrayBtn")&&($("#nextTrayBtn").onclick=nextTrayClick);
  $("#saveNote")&&($("#saveNote").onclick=saveNote);
  $("#saveExpense")&&($("#saveExpense").onclick=saveExpense);
  $("#saveRemind")&&($("#saveRemind").onclick=()=>{state.reminder.offAlertMin=Number($("#offAlert").value);save();alert("已保存")})
  $$(".range").forEach(b=>b.onclick=()=>{$$(".range").forEach(x=>x.classList.remove("active"));b.classList.add("active");drawChart(Number(b.dataset.days))})
}
function tick(){if(chew.running)tickChew(); if($("#app")){let t=$("#chewTime"); if(t)t.textContent=fmt(chew.left).slice(3)}}
function tickChew(){let now=Date.now(),used=now-chew.last;chew.left-=used;chew.last=now;period().chewMs=(period().chewMs||0)+used;if(chew.left<=0){chew.left=0;chew.running=false;alert("咬胶完成")}save()}
function manualAdd(){let s=new Date($("#manualStart").value),e=new Date($("#manualEnd").value);if(!s||!e||e<=s)return alert("请填写正确时间");let ms=e-s,p=period();p.offMs+=ms;p.events.push(["manual_off",s.getTime(),e.getTime(),ms]);save();render("home")}
function saveTray(){state.settings={brand:$("#brand").value,totalTrays:+$("#totalTrays").value,currentTray:+$("#currentTray").value,daysPerTray:+$("#daysPerTray").value,trayStartDate:$("#trayStartDate").value,trayStartTime:$("#trayStartTime").value,cycleStartTime:$("#cycleStartTime").value};save();render("tray")}
function nextTrayClick(){let s=state.settings;if(s.currentTray>=s.totalTrays)return alert("已经是最后一副");state.trayHistory.unshift({from:s.currentTray,to:s.currentTray+1,at:new Date().toLocaleString()});s.currentTray++;let n=new Date();s.trayStartDate=dateStr(n);s.trayStartTime=`${pad(n.getHours())}:${pad(n.getMinutes())}`;save();render("tray")}
function saveExpense(){let a=Number($("#expenseAmount").value);if(!a)return alert("请输入金额");state.expenses.unshift({amount:a,category:$("#expenseCategory").value,date:$("#expenseDate").value,note:$("#expenseNote").value,at:new Date().toLocaleString()});save();render("expense")}
async function compress(file){return new Promise((res,rej)=>{let r=new FileReader();r.onload=e=>{let img=new Image();img.onload=()=>{let sc=Math.min(1,1200/img.width),c=document.createElement("canvas");c.width=img.width*sc;c.height=img.height*sc;c.getContext("2d").drawImage(img,0,0,c.width,c.height);c.toBlob(b=>res(b),"image/jpeg",.8)};img.src=e.target.result};r.onerror=rej;r.readAsDataURL(file)})}
async function saveNote(){let txt=$("#noteText").value.trim(),files=Array.from($("#notePhotos").files||[]);if(!txt&&!files.length)return alert("请填写日记或上传照片");let photos=[];for(let f of files){let blob=await compress(f);if(user){let path=`${user.id}/tray_${state.settings.currentTray}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;let up=await sb.storage.from(BUCKET).upload(path,blob,{contentType:"image/jpeg",upsert:true});if(up.error){alert("照片上传失败："+up.error.message);continue}let pub=sb.storage.from(BUCKET).getPublicUrl(path);photos.push({url:pub.data.publicUrl,path})}else{let url=await new Promise(r=>{let fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(blob)});photos.push({url,local:true})}}state.notes.unshift({id:Date.now(),tray:state.settings.currentTray,period:periodKey(),text:txt,photos,at:new Date().toLocaleString()});save();render("diary")}
function drawChart(days=7){let s=avg(days),s7=avg(7),s30=avg(30);$("#avg7").textContent=s7.avg.toFixed(1);$("#avg30").textContent=s30.avg.toFixed(1);["ring7","ring30"].forEach((id,i)=>{let v=i?s30.avg:s7.avg,deg=Math.min(360,v/24*360);$("#"+id).style.background=`conic-gradient(var(--green) 0deg,var(--green) ${deg}deg,#e9f6ec ${deg}deg)`});let keys=s.keys;if(keys.length)$("#rangeText").textContent=`${keys[0].replaceAll("-","/")} - ${keys.at(-1).replaceAll("-","/")}`;let cv=$("#chart"),ctx=cv.getContext("2d");ctx.clearRect(0,0,500,300);let L=42,T=30,W=430,H=210,y20=T+H-(20/24)*H;ctx.strokeStyle="#74c982";ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(L,y20);ctx.lineTo(L+W,y20);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle="#777";ctx.fillText("24",8,T+6);ctx.fillText("0",14,T+H);ctx.fillStyle="#74c982";ctx.fillText("20",L+W-5,y20-8);keys.forEach((k,i)=>{let x=L+(keys.length===1?W/2:i*W/(keys.length-1)),h=wearMs(k)/3600000,y=T+H-Math.min(24,h)/24*H;ctx.fillStyle=h>=22?"#74c982":"#ffb020";ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#5b9f62";ctx.fillText(h.toFixed(1),x-12,y-18);ctx.fillStyle="#888";let d=new Date(k+"T00:00");ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`,x-14,T+H+28)})}
async function signUp(){let e=$("#email").value,p=$("#pwd").value,msg=$("#msg");msg.textContent="注册中...";let r=await sb.auth.signUp({email:e,password:p});msg.textContent=r.error?"注册失败："+r.error.message:"注册成功，请登录或查看邮箱验证"}
async function signIn(){let e=$("#email").value,p=$("#pwd").value,msg=$("#msg");msg.textContent="登录中...";let r=await sb.auth.signInWithPassword({email:e,password:p});if(r.error)return msg.textContent="登录失败："+r.error.message;user=r.data.user;await pullCloud();render("home")}
async function signOut(){await syncNow();await sb.auth.signOut();user=null;render("home")}
let syncTimer=null;function syncLater(){if(!user)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,1000)}
async function pullCloud(){let r=await sb.from("aligner_records").select("*").order("record_date");if(r.error)return alert("读取云端失败："+r.error.message);(r.data||[]).forEach(x=>{try{let p=JSON.parse(x.note||"{}");Object.assign(state,p)}catch(e){}});localStorage.setItem(KEY,JSON.stringify(state))}
async function syncNow(){if(!user)return;let k=periodKey(),p=period(),off=offMs(),payload={settings:state.settings,periods:state.periods,notes:state.notes,expenses:state.expenses,trayHistory:state.trayHistory,reminder:state.reminder};await sb.from("aligner_records").upsert({user_id:user.id,record_date:k,wear_seconds:Math.floor(wearMs()/1000),off_seconds:Math.floor(off/1000),off_count:(p.events||[]).filter(x=>x[0].includes("off")).length,current_tray:state.settings.currentTray,total_trays:state.settings.totalTrays,tray_start_date:state.settings.trayStartDate,chew_seconds:Math.floor((p.chewMs||0)/1000),note:JSON.stringify(payload),updated_at:new Date().toISOString()},{onConflict:"user_id,record_date"})}

boot();
