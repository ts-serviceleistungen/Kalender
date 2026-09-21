const db=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
let current=new Date(), mode="month", events=[], editingId=null;
let shiftExceptions=[];

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
function render(){ $("period").textContent=periodText(); if(mode==="month")renderMonth(); else renderTimeView() }
function eventHtml(e){const s=new Date(e.start_time);const en=new Date(e.end_time);return `<div class="event ${cls(e)}" data-id="${e.id}"><b>${esc(e.title)}</b><br>${pad(s.getHours())}:${pad(s.getMinutes())}–${pad(en.getHours())}:${pad(en.getMinutes())}</div>`}
function renderMonth(){let [a,b]=rangeFor(), html=`<div class="monthgrid">`;["Mo","Di","Mi","Do","Fr","Sa","So"].forEach(x=>html+=`<div class="dow">${x}</div>`);for(let d=new Date(a);d<b;d.setDate(d.getDate()+1)){const day=new Date(d), next=new Date(day);next.setDate(next.getDate()+1);html+=`<div class="day"><div class="daynum">${day.getDate()}</div>`;events.filter(e=>new Date(e.start_time)<next&&new Date(e.end_time)>day).forEach(e=>html+=eventHtml(e));html+="</div>"}html+="</div>";$("calendar").innerHTML=html;bindEvents()}
function renderTimeView(){let a=mode==="day"?new Date(current):startOfWeek(current);let days=mode==="day"?1:7;let html='<div class="week">';for(let h=0;h<24;h++){html+=`<div class="timeRow"><div class="time">${pad(h)}:00</div><div class="slot">`;for(let i=0;i<days;i++){let d=new Date(a);d.setDate(d.getDate()+i);let s=new Date(d);s.setHours(h,0,0,0);let en=new Date(s);en.setHours(h+1);events.filter(e=>new Date(e.start_time)<en&&new Date(e.end_time)>s).forEach(e=>html+=eventHtml(e))}html+='</div></div>'}html+='</div>';$("calendar").innerHTML=html;bindEvents()}
function bindEvents(){document.querySelectorAll(".event").forEach(x=>x.onclick=()=>openEdit(x.dataset.id))}

function isoDateLocal(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function dateFromYmd(v){const [y,m,d]=v.split("-").map(Number);return new Date(y,m-1,d)}
function shiftCycleIsWork(index){return [0,2,4].includes(index%9)}
function exceptionFor(dateStr){return shiftExceptions.find(x=>x.date===dateStr)}
function renderExceptions(){
  const box=$("exceptionsList");
  if(!shiftExceptions.length){box.innerHTML="<small>Keine Ausnahmen eingetragen.</small>";return}
  box.innerHTML=shiftExceptions
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map((x,i)=>`<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee">
      <span><b>${esc(new Date(x.date+"T12:00:00").toLocaleDateString("de-DE"))}</b> – ${esc(x.type)}</span>
      <button type="button" class="danger" data-ex="${i}" style="padding:5px 8px">×</button>
    </div>`).join("");
  box.querySelectorAll("[data-ex]").forEach(b=>b.onclick=()=>{
    shiftExceptions.splice(Number(b.dataset.ex),1); renderExceptions();
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
  const date=$("exceptionDate").value, type=$("exceptionType").value;
  if(!date){$("shiftMsg").textContent="Bitte zuerst ein Datum auswählen.";return}
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

  $("shiftMsg").textContent="Alten Schichtplan wird entfernt…";

  // Wichtig: Alte automatisch erzeugte Schichten vollständig entfernen.
  // Manuelle Termine bleiben unangetastet.
  const del=await db.from("personal_calendar_events")
    .delete()
    .eq("source","shift_plan");

  if(del.error){
    $("shiftMsg").textContent="Fehler beim Löschen des alten Schichtplans: "+del.error.message;
    return;
  }

  const start=dateFromYmd(startDate);
  const until=new Date(start);
  until.setMonth(until.getMonth()+months);

  const rows=[];

  // Exakt: Arbeit – Frei – Arbeit – Frei – Arbeit – Frei – Frei – Frei – Frei
  // = 9-Tage-Zyklus.
  for(let offset=0; ; offset++){
    const d=new Date(start);
    d.setDate(start.getDate()+offset);

    if(d>=until) break;

    const cycleDay=offset%9;
    const isWork=(cycleDay===0 || cycleDay===2 || cycleDay===4);

    const dateStr=isoDateLocal(d);
    const ex=exceptionFor(dateStr);

    let finalWork=isWork;

    // Urlaub und zusätzlicher freier Tag:
    // keine persönliche Schicht -> Kunden können buchen.
    if(ex?.type==="Urlaub" || ex?.type==="Frei"){
      finalWork=false;
    }

    // Zusätzlicher Arbeitstag:
    // persönliche Schicht -> Kundenbuchungen blockieren.
    if(ex?.type==="Arbeit"){
      finalWork=true;
    }

    if(!finalWork) continue;

    const s=new Date(`${dateStr}T${startTime}`);
    const eDate=new Date(d);
    eDate.setDate(eDate.getDate()+1);
    const e=new Date(`${isoDateLocal(eDate)}T${endTime}`);

    rows.push({
      title:"24-Stunden-Schicht",
      event_type:"24-Stunden-Schicht",
      start_time:s.toISOString(),
      end_time:e.toISOString(),
      notes:ex?.type==="Arbeit"
        ? "Zusätzlicher Arbeitstag"
        : "Automatisch aus Schichtplan",
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

  $("shiftMsg").textContent=
    `Fertig: ${rows.length} Arbeitsschichten erstellt. `+
    `Freie Tage und Urlaub bleiben im Kalender frei und für Kunden buchbar.`;

  await load();
  setTimeout(()=>{$("shiftModal").hidden=true},1200);
}
$("shiftPlan").onclick=openShiftPlan;
$("closeShift").onclick=(ev)=>{ev.preventDefault();$("shiftModal").hidden=true;};
$("addException").onclick=(ev)=>{ev.preventDefault();addException();};
$("generateShiftPlan").onclick=(ev)=>{ev.preventDefault();generateShiftPlan();};
$("shiftModal").addEventListener("click",ev=>{if(ev.target===$("shiftModal"))$("shiftModal").hidden=true;});

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
