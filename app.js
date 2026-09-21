const db=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let current=new Date(), mode="month", events=[], editingId=null, shiftExceptions=[];

const $=id=>document.getElementById(id);
function pad(n){return String(n).padStart(2,"0")}
function localInput(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function fromInput(v){return new Date(v)}
function esc(s=""){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function cls(e){if(e.event_type==="Garten")return"garden";if(e.event_type==="Fahrzeugpflege")return"vehicle";if(e.event_type==="24-Stunden-Schicht")return"shift";return"private"}
function startOfWeek(d){const x=new Date(d);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);x.setHours(0,0,0,0);return x}
function endOfWeek(d){const x=startOfWeek(d);x.setDate(x.getDate()+7);return x}
function fmt(d){return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"})}
function rangeFor(){if(mode==="day"){let a=new Date(current);a.setHours(0,0,0,0);let b=new Date(a);b.setDate(b.getDate()+1);return[a,b]}if(mode==="week")return[startOfWeek(current),endOfWeek(current)];let a=new Date(current.getFullYear(),current.getMonth(),1);a.setDate(a.getDate()-((a.getDay()+6)%7));let b=new Date(current.getFullYear(),current.getMonth()+1,0);b.setDate(b.getDate()+7-((b.getDay()+6)%7));return[a,b]}
async function load(){const [a,b]=rangeFor();const {data,error}=await db.from("personal_calendar_events").select("*").lt("start_time",b.toISOString()).gt("end_time",a.toISOString()).order("start_time");if(error){console.error(error);return}events=data||[];render()}
function periodText(){if(mode==="month")return current.toLocaleDateString("de-DE",{month:"long",year:"numeric"});if(mode==="week"){const a=startOfWeek(current),b=new Date(a);b.setDate(b.getDate()+6);return `${fmt(a)} – ${fmt(b)}`}return fmt(current)}
function render(){
  $("period").textContent=periodText();
  if($("monthPicker"))$("monthPicker").value=`${current.getFullYear()}-${pad(current.getMonth()+1)}`;
  if(mode==="month")renderMonth(); else renderTimeView();
}
function eventHtml(e){
  const s=new Date(e.start_time), en=new Date(e.end_time);
  const endLabel=e.event_type==="24-Stunden-Schicht"
    ? `${pad(en.getHours())}:${pad(en.getMinutes())} Folgetag`
    : `${pad(en.getHours())}:${pad(en.getMinutes())}`;
  return `<div class="event ${cls(e)}" data-id="${e.id}">
    <b>${esc(e.title)}</b><br>${pad(s.getHours())}:${pad(s.getMinutes())}–${endLabel}
  </div>`;
}

function isoDateLocal(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function dateFromYmd(v){
  const [y,m,d]=v.split("-").map(Number);
  return new Date(y,m-1,d);
}
function shiftCycleIsWork(index){
  return index%9===0 || index%9===2 || index%9===4;
}
function exceptionFor(dateStr){
  return shiftExceptions.find(x=>x.date===dateStr);
}
function renderExceptions(){
  const box=$("exceptionsList");
  if(!box)return;
  if(!shiftExceptions.length){
    box.innerHTML="<small>Keine Ausnahmen eingetragen.</small>";
    return;
  }
  const sorted=shiftExceptions.slice().sort((a,b)=>a.date.localeCompare(b.date));
  box.innerHTML=sorted.map((x,i)=>`
    <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
      <span><b>${esc(new Date(x.date+"T12:00:00").toLocaleDateString("de-DE"))}</b> – ${esc(x.type)}</span>
      <button type="button" class="danger" data-ex="${i}" style="padding:5px 8px">×</button>
    </div>`).join("");
  box.querySelectorAll("[data-ex]").forEach(btn=>{
    btn.onclick=()=>{
      const item=sorted[Number(btn.dataset.ex)];
      shiftExceptions=shiftExceptions.filter(x=>x!==item);
      renderExceptions();
    };
  });
}
function openShiftPlan(){
  const now=new Date();
  $("shiftStartDate").value=isoDateLocal(now);
  $("exceptionDate").value=isoDateLocal(now);
  $("shiftStartTime").value="06:00";
  $("shiftEndTime").value="06:30";
  $("shiftMonths").value="12";
  shiftExceptions=[];
  $("shiftMsg").textContent="";
  renderExceptions();
  $("shiftModal").hidden=false;
}
function addException(){
  const date=$("exceptionDate").value;
  const type=$("exceptionType").value;
  if(!date){
    $("shiftMsg").textContent="Bitte ein Datum auswählen.";
    return;
  }
  shiftExceptions=shiftExceptions.filter(x=>x.date!==date);
  shiftExceptions.push({date,type});
  renderExceptions();
  $("shiftMsg").textContent="";
}
async function generateShiftPlan(){
  const startDate=$("shiftStartDate").value;
  const startTime=$("shiftStartTime").value||"06:00";
  const endTime=$("shiftEndTime").value||"06:30";
  const months=Number($("shiftMonths").value||12);

  if(!startDate){
    $("shiftMsg").textContent="Bitte den ersten Arbeitstag auswählen.";
    return;
  }

  const {data:{session}}=await db.auth.getSession();
  if(!session){
    $("shiftMsg").textContent="Bitte zuerst anmelden.";
    return;
  }

  $("shiftMsg").textContent="Schichtplan wird erstellt…";

  const del=await db.from("personal_calendar_events")
    .delete()
    .eq("source","shift_plan");

  if(del.error){
    $("shiftMsg").textContent="Fehler beim Bereinigen: "+del.error.message;
    return;
  }

  const start=dateFromYmd(startDate);
  const until=new Date(start);
  until.setMonth(until.getMonth()+months);
  const rows=[];

  for(let offset=0;;offset++){
    const d=new Date(start);
    d.setDate(start.getDate()+offset);
    if(d>=until)break;

    const dateStr=isoDateLocal(d);
    const ex=exceptionFor(dateStr);
    let work=shiftCycleIsWork(offset);

    if(ex?.type==="Urlaub" || ex?.type==="Frei")work=false;
    if(ex?.type==="Arbeit")work=true;

    if(!work)continue;

    const s=new Date(`${dateStr}T${startTime}`);
    const next=new Date(d);
    next.setDate(next.getDate()+1);
    const e=new Date(`${isoDateLocal(next)}T${endTime}`);

    rows.push({
      title:"24-Stunden-Schicht",
      event_type:"24-Stunden-Schicht",
      start_time:s.toISOString(),
      end_time:e.toISOString(),
      notes:ex?.type==="Arbeit"?"Zusätzlicher Arbeitstag":"Automatisch aus Schichtplan",
      blocks_customer_bookings:true,
      source:"shift_plan",
      shift_date:dateStr
    });
  }

  if(rows.length){
    const ins=await db.from("personal_calendar_events").insert(rows);
    if(ins.error){
      $("shiftMsg").textContent="Fehler beim Erstellen: "+ins.error.message;
      return;
    }
  }

  $("shiftMsg").textContent=`Fertig: ${rows.length} Arbeitsschichten erstellt.`;
  await load();
  setTimeout(()=>$("shiftModal").hidden=true,900);
}

function renderMonth(){
  let [a,b]=rangeFor(), html=`<div class="monthgrid">`;
  ["Mo","Di","Mi","Do","Fr","Sa","So"].forEach(x=>html+=`<div class="dow">${x}</div>`);
  for(let d=new Date(a);d<b;d.setDate(d.getDate()+1)){
    const day=new Date(d), key=isoDateLocal(day);
    html+=`<div class="day"><div class="daynum">${day.getDate()}</div>`;
    events.filter(e=>isoDateLocal(new Date(e.start_time))===key).forEach(e=>html+=eventHtml(e));
    html+="</div>";
  }
  html+="</div>";
  $("calendar").innerHTML=html; bindEvents();
}
function renderTimeView(){let a=mode==="day"?new Date(current):startOfWeek(current);let days=mode==="day"?1:7;let html='<div class="week">';for(let h=0;h<24;h++){html+=`<div class="timeRow"><div class="time">${pad(h)}:00</div><div class="slot">`;for(let i=0;i<days;i++){let d=new Date(a);d.setDate(d.getDate()+i);let s=new Date(d);s.setHours(h,0,0,0);let en=new Date(s);en.setHours(h+1);events.filter(e=>new Date(e.start_time)<en&&new Date(e.end_time)>s).forEach(e=>html+=eventHtml(e))}html+='</div></div>'}html+='</div>';$("calendar").innerHTML=html;bindEvents()}
function bindEvents(){
  document.querySelectorAll(".event").forEach(x=>x.onclick=(ev)=>{
    ev.preventDefault();ev.stopPropagation();openEdit(x.dataset.id);
  });
}
function openNew(){editingId=null;$("modalTitle").textContent="Termin hinzufügen";$("title").value="";$("type").value="24-Stunden-Schicht";let s=new Date(current);s.setHours(6,0,0,0);let e=new Date(s);e.setDate(e.getDate()+1);e.setHours(6,30,0,0);$("start").value=localInput(s);$("end").value=localInput(e);$("notes").value="";$("block").checked=true;$("delete").hidden=true;$("formMsg").textContent="";$("modal").hidden=false}
function setShiftTimes(){
  const startValue = $("start").value;
  if(!startValue) return;
  const start = fromInput(startValue);
  if(isNaN(start)) return;
  start.setHours(6,0,0,0);
  const end = new Date(start);
  end.setDate(end.getDate()+1);
  end.setHours(6,30,0,0);
  $("start").value = localInput(start);
  $("end").value = localInput(end);
}

$("type").addEventListener("change",()=>{
  if($("type").value==="24-Stunden-Schicht"){
    setShiftTimes();
  }
});

function openEdit(id){const e=events.find(x=>x.id===id);if(!e)return;editingId=id;$("modalTitle").textContent="Termin bearbeiten";$("title").value=e.title;$("type").value=e.event_type;$("start").value=localInput(new Date(e.start_time));$("end").value=localInput(new Date(e.end_time));$("notes").value=e.notes||"";$("block").checked=e.blocks_customer_bookings;$("delete").hidden=false;$("formMsg").textContent="";$("modal").hidden=false}
async function save(){
  const title=$("title").value.trim(), s=fromInput($("start").value), e=fromInput($("end").value);
  if(!title||isNaN(s)||isNaN(e)||e<=s){
    $("formMsg").textContent="Bitte Titel sowie gültigen Beginn und Ende eingeben.";
    return;
  }
  const {data:{session}}=await db.auth.getSession();
  if(!session){
    $("formMsg").textContent="Deine Anmeldung ist abgelaufen. Bitte erneut anmelden.";
    setTimeout(()=>location.reload(),1200);
    return;
  }
  const payload={
    title,
    event_type:$("type").value,
    start_time:s.toISOString(),
    end_time:e.toISOString(),
    notes:$("notes").value.trim()||null,
    blocks_customer_bookings:$("block").checked
  };
  $("formMsg").textContent="Speichere…";
  const operation=editingId
    ? db.from("personal_calendar_events").update(payload).eq("id",editingId)
    : db.from("personal_calendar_events").insert(payload);
  const timeout=new Promise(resolve=>setTimeout(()=>resolve({error:{message:"Zeitüberschreitung beim Speichern. Bitte Internetverbindung und Supabase-Anmeldung prüfen."}}),10000));
  const r=await Promise.race([operation,timeout]);
  if(r.error){
    $("formMsg").textContent="Fehler: "+r.error.message;
    return;
  }
  $("modal").hidden=true;
  await load();
}
async function del(){if(!editingId||!confirm("Diesen Termin wirklich löschen?"))return;const r=await db.from("personal_calendar_events").delete().eq("id",editingId);if(r.error){$("formMsg").textContent=r.error.message;return}$("modal").hidden=true;await load()}
$("login").onclick=async()=>{
  const r=await db.auth.signInWithPassword({email:$("email").value,password:$("password").value});
  if(r.error){$("loginMsg").textContent=r.error.message;return}
  init();
};
$("logout").onclick=async()=>{await db.auth.signOut();location.reload()};
$("add").onclick=(ev)=>{ev.preventDefault();openNew()};
$("shiftPlan").onclick=(ev)=>{ev.preventDefault();openShiftPlan()};
$("cancel").onclick=(ev)=>{ev.preventDefault();$("modal").hidden=true};
$("save").onclick=(ev)=>{ev.preventDefault();save()};
$("delete").onclick=(ev)=>{ev.preventDefault();del()};
$("closeShift").onclick=(ev)=>{ev.preventDefault();$("shiftModal").hidden=true};
$("addException").onclick=(ev)=>{ev.preventDefault();addException()};
$("generateShiftPlan").onclick=(ev)=>{ev.preventDefault();generateShiftPlan()};
$("modal").addEventListener("click",ev=>{if(ev.target===$("modal"))$("modal").hidden=true});
$("shiftModal").addEventListener("click",ev=>{if(ev.target===$("shiftModal"))$("shiftModal").hidden=true});
$("prev").onclick=(ev)=>{
  ev.preventDefault();
  if(mode==="month")current.setMonth(current.getMonth()-1);
  else if(mode==="week")current.setDate(current.getDate()-7);
  else current.setDate(current.getDate()-1);
  load();
};
$("next").onclick=(ev)=>{
  ev.preventDefault();
  if(mode==="month")current.setMonth(current.getMonth()+1);
  else if(mode==="week")current.setDate(current.getDate()+7);
  else current.setDate(current.getDate()+1);
  load();
};
$("today").onclick=(ev)=>{ev.preventDefault();current=new Date();load()};
$("viewMode").onchange=()=>{mode=$("viewMode").value;load()};
$("monthPicker").onchange=()=>{
  if(!$("monthPicker").value)return;
  const [y,m]=$("monthPicker").value.split("-").map(Number);
  current=new Date(y,m-1,1); mode="month"; $("viewMode").value="month"; load();
};
$("type").onchange=()=>{
  if($("type").value==="24-Stunden-Schicht")setShiftTimes();
};

async function init(){
  const {data}=await db.auth.getSession();
  if(!data.session){
    $("loginView").hidden=false;
    $("calendarView").hidden=true;
    $("logout").hidden=true;
    return;
  }
  $("loginView").hidden=true;
  $("calendarView").hidden=false;
  $("logout").hidden=false;
  await load();
}
db.auth.onAuthStateChange((_event,session)=>{
  if(!session){$("loginView").hidden=false;$("calendarView").hidden=true;$("logout").hidden=true;}
});

init();
