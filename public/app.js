const ACTIONS=[
 ["interview","Entrevista"],["vd","V.D."],["reinsertion","Reinserción social"],["management","Gestión"],
 ["interconsult","Interconsultas"],["socialReport","Informe social"],["deliveryAct","Acta de entrega"],
 ["socialFile","Ficha social"],["fese","FESE"],["sis","Afiliación SIS"],["counseling","Consejería social"],
 ["orientation","Orientación social"],["talk","Charla/Reunión"]
];
const MORBIDITY=[["health","Salud"],["economic","Económica"],["family","Familiar"],["housing","Vivienda"]];
const SERVICES={
 "Consulta externa":["Cirugía","Ginecología","Obstetricia","Medicina","Pediatría","Traumatología","Tropicales","UTR","Evaluación invalidez","MAMIS","Diálisis Peritoneal Adultos","Otros"],
 "Hospitalización":["Cirugía","Ginecología","Obstetricia","Recién Nac.","Medicina","Pediatría","Traumatología","Tropicales","Oncología","UHSMA","CENEX","UTR","Otros"]
};
const MAX_AGE=90;
const $=id=>document.getElementById(id);
const now=new Date(), pad=n=>String(n).padStart(2,"0");
const monthNow=`${now.getFullYear()}-${pad(now.getMonth()+1)}`, dateNow=`${monthNow}-${pad(now.getDate())}`;
let records=[];
let currentUserInfo=null;

$("today").textContent=now.toLocaleDateString("es-PE",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
$("dashMonth").value=monthNow;$("recordMonth").value=monthNow;$("reportMonth").value=monthNow;$("date").value=dateNow;

function toast(msg){$("toast").textContent=msg;$("toast").classList.add("toast-show");setTimeout(()=>$("toast").classList.remove("toast-show"),2400)}
function monthOf(r){return r.date.slice(0,7)}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function initChecks(){
 $("actions").innerHTML=ACTIONS.map(([k,l])=>`<label class="check"><input type="checkbox" name="action" value="${k}"> ${l}</label>`).join("");
 $("morbidity").innerHTML=MORBIDITY.map(([k,l])=>`<label class="check"><input type="checkbox" name="morbidity" value="${k}"> ${l}</label>`).join("");
}
initChecks();

function populateServices(){
 const list=SERVICES[$("type").value]||[];
 $("service").innerHTML=list.length?list.map(x=>`<option>${x}</option>`).join(""):`<option value="">Selecciona primero el tipo</option>`;
}
$("type").addEventListener("change",populateServices);

/* ================= Comunicación con el servidor (API) ================= */
async function api(path,options={}){
 const res=await fetch(path,{
   method:options.method||"GET",
   headers:options.body?{"Content-Type":"application/json"}:{},
   body:options.body?JSON.stringify(options.body):undefined,
   credentials:"same-origin"
 });
 let data=null;
 try{data=await res.json()}catch(e){}
 if(res.status===401){
   currentUserInfo=null;
   showLogin();
   const err=new Error((data&&data.error)||"Debes iniciar sesión");
   err.status=401;throw err;
 }
 if(!res.ok){
   const err=new Error((data&&data.error)||`Error ${res.status}`);
   err.status=res.status;throw err;
 }
 return data;
}
async function loadRecords(){
 try{const d=await api("/api/records");records=d.records||[]}
 catch(e){if(e.status!==401)toast(e.message||"No se pudieron cargar los datos")}
}

/* ============================= Autenticación ============================ */
function showLogin(){
 $("loginScreen").classList.remove("app-hidden");
 $("appRoot").classList.add("app-hidden");
}
function applyUserToUI(){
 $("userNameLabel").textContent=currentUserInfo.name;
 $("userRoleLabel").textContent=currentUserInfo.role==="admin"?"Administrador(a)":"Asistenta social";
 document.querySelectorAll(".admin-only").forEach(el=>{el.style.display=currentUserInfo.role==="admin"?"":"none"});
}
async function enterApp(){
 $("loginScreen").classList.add("app-hidden");
 $("appRoot").classList.remove("app-hidden");
 applyUserToUI();
 await showView("dashboard");
}
async function bootApp(){
 try{
   const d=await api("/api/me");
   currentUserInfo=d.user;
   await enterApp();
 }catch(e){showLogin()}
}
$("loginForm").onsubmit=async e=>{
 e.preventDefault();
 $("loginError").textContent="";
 const dni=$("loginDni").value.trim(), password=$("loginPassword").value;
 try{
   const d=await api("/api/login",{method:"POST",body:{dni,password}});
   currentUserInfo=d.user;
   $("loginPassword").value="";
   await enterApp();
   if(currentUserInfo.mustChangePassword) toast("Recuerda cambiar tu contraseña inicial en '🔑 Contraseña'");
 }catch(err){
   $("loginError").textContent=err.message||"No se pudo iniciar sesión";
 }
};
$("logoutBtn").onclick=async ()=>{
 try{await api("/api/logout",{method:"POST"})}catch(e){}
 currentUserInfo=null;records=[];
 $("loginDni").value="";$("loginPassword").value="";$("loginError").textContent="";
 showLogin();
};

/* ------- Cambiar contraseña ------- */
$("changePassBtn").onclick=()=>{
 $("changePasswordForm").reset();$("changePassError").textContent="";
 $("changePasswordModal").classList.add("show");
};
$("closeChangePass").onclick=()=>$("changePasswordModal").classList.remove("show");
$("changePasswordForm").onsubmit=async e=>{
 e.preventDefault();
 $("changePassError").textContent="";
 const currentPassword=$("currentPassword").value, newPassword=$("newPassword").value, newPassword2=$("newPassword2").value;
 if(newPassword!==newPassword2){$("changePassError").textContent="Las contraseñas nuevas no coinciden";return}
 try{
   await api("/api/change-password",{method:"POST",body:{currentPassword,newPassword}});
   currentUserInfo.mustChangePassword=false;
   $("changePasswordModal").classList.remove("show");
   toast("Contraseña actualizada");
 }catch(err){$("changePassError").textContent=err.message||"No se pudo cambiar la contraseña"}
};

/* ------- Administración de usuarios (solo admin) ------- */
async function renderUsers(){
 if(currentUserInfo.role!=="admin"){$("usersTable").innerHTML="";return}
 const d=await api("/api/users").catch(()=>({users:[]}));
 const users=d.users||[];
 let html='<thead><tr><th>Nombre</th><th>DNI</th><th>Rol</th><th>Debe cambiar contraseña</th><th>Acciones</th></tr></thead><tbody>';
 users.forEach(u=>{
   const mine=u.id===currentUserInfo.id;
   html+=`<tr><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.dni)}</td><td>${u.role==="admin"?"Administrador(a)":"Asistenta social"}</td><td>${u.mustChangePassword?"Sí":"No"}</td><td class="actions-cell">${mine?'<span class="muted">Tu usuario</span>':`<button title="Restablecer contraseña" onclick="resetUserPassword('${u.id}')">🔁</button><button title="Eliminar" onclick="deleteUser('${u.id}')">🗑️</button>`}</td></tr>`;
 });
 html+="</tbody>";$("usersTable").innerHTML=html;
}
$("newUserForm").onsubmit=async e=>{
 e.preventDefault();
 const name=$("newUserName").value.trim(), dni=$("newUserDni").value.trim();
 try{
   await api("/api/users",{method:"POST",body:{name,dni}});
   toast("Usuario creado. Su contraseña inicial es su DNI.");
   $("newUserForm").reset();
   renderUsers();
 }catch(err){toast(err.message||"No se pudo crear el usuario")}
};
window.deleteUser=async id=>{
 if(!confirm("¿Eliminar este usuario?"))return;
 try{await api("/api/users/"+encodeURIComponent(id),{method:"DELETE"});toast("Usuario eliminado");renderUsers()}
 catch(err){toast(err.message||"No se pudo eliminar")}
};
window.resetUserPassword=async id=>{
 if(!confirm("¿Restablecer la contraseña de este usuario a su DNI?"))return;
 try{const r=await api(`/api/users/${encodeURIComponent(id)}/reset-password`,{method:"POST"});toast(`Contraseña restablecida a: ${r.newPassword}`);renderUsers()}
 catch(err){toast(err.message||"No se pudo restablecer")}
};

/* ---------- Navegación / menú hamburguesa ---------- */
document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>showView(btn.dataset.view)));
$("quickNew").onclick=()=>showView("new");

function closeSidebar(){document.querySelector(".sidebar").classList.remove("open");$("sidebarOverlay").classList.remove("show")}
$("hamburgerBtn").onclick=()=>{document.querySelector(".sidebar").classList.toggle("open");$("sidebarOverlay").classList.toggle("show")};
$("sidebarOverlay").onclick=closeSidebar;

async function showView(view){
 closeSidebar();
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 $(view).classList.add("active");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const titles={dashboard:"Resumen",new:"Nueva atención",records:"Atenciones registradas",report:"Informe mensual",users:"Usuarios del sistema"};
 $("pageTitle").textContent=titles[view]||"";
 if(view==="dashboard"){await loadRecords();renderDashboard()}
 if(view==="records"){await loadRecords();renderRecords()}
 if(view==="report"){await loadRecords();renderReport()}
 if(view==="users")await renderUsers();
 window.scrollTo(0,0);
}

$("dashMonth").onchange=renderDashboard;
$("recordMonth").onchange=renderRecords;
$("reportMonth").onchange=renderReport;
$("search").oninput=renderRecords;

/* ---------- Edad ---------- */
function ageLabel(r){
 if(r.ageValue===undefined||r.ageValue===null||r.ageValue==="")return"";
 const unit=r.ageUnit||"años";
 if(unit==="meses")return`${r.ageValue} ${r.ageValue===1?"mes":"meses"}`;
 return`${r.ageValue} ${r.ageValue===1?"año":"años"}`;
}
function ageInfo(r){
 if(r.ageValue===undefined||r.ageValue===null||r.ageValue==="")return null;
 const v=Number(r.ageValue);
 if(isNaN(v))return null;
 if((r.ageUnit||"años")==="meses")return{type:"m"};
 if(v<=0)return{type:"m"};
 const years=Math.round(v);
 if(years>MAX_AGE)return{type:"otros",value:years};
 return{type:"y",value:years};
}
function computeAge(dobStr,refStr){
 const dob=new Date(dobStr+"T00:00:00"), ref=new Date((refStr||dateNow)+"T00:00:00");
 if(isNaN(dob)||isNaN(ref)||ref<dob)return null;
 let years=ref.getFullYear()-dob.getFullYear();
 const beforeBirthdayThisYear=(ref.getMonth()<dob.getMonth())||(ref.getMonth()===dob.getMonth()&&ref.getDate()<dob.getDate());
 if(beforeBirthdayThisYear)years--;
 if(years<1){
   let months=(ref.getFullYear()-dob.getFullYear())*12+(ref.getMonth()-dob.getMonth());
   if(ref.getDate()<dob.getDate())months--;
   return{value:Math.max(0,Math.min(months,11)),unit:"meses"};
 }
 return{value:years,unit:"años"};
}
$("birthDate").addEventListener("change",()=>{
 if(!$("birthDate").value||$("ageValue").value!=="")return;
 const a=computeAge($("birthDate").value,$("date").value);
 if(a){$("ageValue").value=a.value;$("ageUnit").value=a.unit}
});

/* ---------- Listados / dashboard ---------- */
function filtered(month){return records.filter(r=>monthOf(r)===month)}
function sumAction(rs,key){return rs.filter(r=>r.actions.includes(key)).length}

function renderDashboard(){
 const rs=filtered($("dashMonth").value);
 const external=rs.filter(r=>r.type==="Consulta externa").length, hosp=rs.filter(r=>r.type==="Hospitalización").length;
 $("summaryCards").innerHTML=[
  ["👥","Pacientes / atenciones",rs.length],["🏥","Consulta externa",external],["🛏️","Hospitalización",hosp],["📝","Entrevistas",sumAction(rs,"interview")]
 ].map(x=>`<div class="card"><div class="label">${x[0]} ${x[1]}</div><div class="value">${x[2]}</div></div>`).join("");
 $("dashCount").textContent=`${rs.length} registros`;
 const cols=["Atendidos","Total","Entrev.","V.D.","Reins.","Gest.","Interc.","Inf. social","Acta","Ficha","FESE","SIS","Consej.","Orient.","Charla","Salud","Econ.","Fam.","Viv."];
 let html="<thead><tr><th>Servicio</th>"+cols.map(c=>`<th>${c}</th>`).join("")+"</tr></thead><tbody>";
 for(const type of Object.keys(SERVICES)){
   for(const service of SERVICES[type]){
     const s=rs.filter(r=>r.type===type&&r.service===service);
     if(!s.length) continue;
     const vals=[s.length,s.length,...ACTIONS.map(([k])=>sumAction(s,k)),...MORBIDITY.map(([k])=>sumAction(s,k))];
     html+=`<tr><td>${type} · ${service}</td>${vals.map(v=>`<td>${v||""}</td>`).join("")}</tr>`;
   }
 }
 if(!rs.length) html+=`<tr><td colspan="${cols.length+1}" class="empty">No hay atenciones registradas para este mes.</td></tr>`;
 html+="</tbody>";$("serviceTable").innerHTML=html;
}

function renderRecords(){
 const month=$("recordMonth").value, q=$("search").value.trim().toLowerCase();
 const rs=records.filter(r=>monthOf(r)===month && (!q
   ||(r.name||"").toLowerCase().includes(q)
   ||(r.dni||"").toLowerCase().includes(q)
   ||(r.patient||"").toLowerCase().includes(q)
   ||r.service.toLowerCase().includes(q)));
 let html=`<thead><tr><th>Fecha</th><th>Nombre</th><th>DNI</th><th>Edad</th><th>Tipo</th><th>Servicio</th><th>Atenciones</th><th>Morbilidad</th><th>Acciones</th></tr></thead><tbody>`;
 if(!rs.length) html+=`<tr><td colspan="9" class="empty">No hay registros.</td></tr>`;
 rs.sort((a,b)=>b.date.localeCompare(a.date)).forEach(r=>{
   const actionLabels=r.actions.map(k=>(ACTIONS.find(x=>x[0]===k)||[])[1]).filter(Boolean).join(", ");
   const mor=r.morbidity.map(k=>(MORBIDITY.find(x=>x[0]===k)||[])[1]).filter(Boolean).join(", ");
   html+=`<tr><td>${r.date}</td><td>${escapeHtml(r.name||r.patient||"—")}</td><td>${escapeHtml(r.dni)}</td><td>${escapeHtml(ageLabel(r))}</td><td>${r.type}</td><td>${r.service}</td><td>${escapeHtml(actionLabels)}</td><td>${escapeHtml(mor)}</td><td class="actions-cell"><button title="Editar" onclick="editRecord('${r.id}')">✏️</button><button title="Acta de entrega" onclick="openActa('${r.id}')">📄</button><button title="Eliminar" onclick="deleteRecord('${r.id}')">🗑️</button></td></tr>`;
 });
 html+="</tbody>";$("recordsTable").innerHTML=html;
}

/* ---------- Alta / edición de atenciones ---------- */
$("attentionForm").onsubmit=async e=>{
 e.preventDefault();
 const id=$("editId").value||crypto.randomUUID();
 const existing=records.find(x=>x.id===id);
 const r={
   ...(existing||{}),
   id,
   date:$("date").value,
   name:$("name").value.trim(),
   dni:$("dni").value.trim(),
   bed:$("bed").value.trim(),
   birthDate:$("birthDate").value,
   ageValue:$("ageValue").value===""?"":Number($("ageValue").value),
   ageUnit:$("ageUnit").value,
   diagnosis:$("diagnosis").value.trim(),
   province:$("province").value.trim(),
   district:$("district").value.trim(),
   patient:$("patient").value.trim(),
   type:$("type").value,
   service:$("service").value,
   actions:[...document.querySelectorAll('input[name="action"]:checked')].map(x=>x.value),
   morbidity:[...document.querySelectorAll('input[name="morbidity"]:checked')].map(x=>x.value),
   acta:existing?existing.acta:null
 };
 if(!r.type||!r.service){toast("Selecciona tipo y servicio");return}
 try{
   await api("/api/records",{method:"POST",body:r});
   toast(existing?"Atención actualizada":"Atención registrada");
   resetForm();
   showView("records");
 }catch(err){toast(err.message||"No se pudo guardar la atención")}
};
function resetForm(){
 $("attentionForm").reset();$("editId").value="";$("date").value=dateNow;$("formTitle").textContent="Registrar atención";
 $("service").innerHTML='<option value="">Selecciona primero el tipo</option>';
}
$("cancelEdit").onclick=()=>{resetForm();showView("records")};

window.editRecord=id=>{
 const r=records.find(x=>x.id===id);if(!r)return;
 showView("new");
 $("editId").value=r.id;$("date").value=r.date;
 $("name").value=r.name||"";$("dni").value=r.dni||"";$("bed").value=r.bed||"";
 $("birthDate").value=r.birthDate||"";$("ageValue").value=r.ageValue??"";$("ageUnit").value=r.ageUnit||"años";
 $("diagnosis").value=r.diagnosis||"";$("province").value=r.province||"";$("district").value=r.district||"";$("patient").value=r.patient||"";
 $("type").value=r.type;populateServices();$("service").value=r.service;$("formTitle").textContent="Editar atención";
 document.querySelectorAll('input[name="action"]').forEach(x=>x.checked=r.actions.includes(x.value));
 document.querySelectorAll('input[name="morbidity"]').forEach(x=>x.checked=r.morbidity.includes(x.value));
};
window.deleteRecord=async id=>{
 if(!confirm("¿Eliminar esta atención?"))return;
 try{
   await api("/api/records/"+encodeURIComponent(id),{method:"DELETE"});
   await loadRecords();renderRecords();renderDashboard();
   toast("Atención eliminada");
 }catch(err){toast(err.message||"No se pudo eliminar")}
};

/* ---------- Informe mensual ---------- */
function reportTable(type,rs){
 const services=SERVICES[type];
 const headers=["Servicio","Atend.","Total","Entrev.","V.D.","Reins.","Gest.","Interc.","Inf. social","Acta","Ficha","FESE","SIS","Consej.","Orient.","Charla","Salud","Econ.","Fam.","Viv."];
 let h=`<table class="report-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>`;
 let totals=Array(headers.length-1).fill(0);
 for(const service of services){
   const s=rs.filter(r=>r.type===type&&r.service===service);
   const vals=[s.length,s.length,...ACTIONS.map(([k])=>sumAction(s,k)),...MORBIDITY.map(([k])=>sumAction(s,k))];
   vals.forEach((v,i)=>totals[i]+=v);
   h+=`<tr><td>${service}</td>${vals.map(v=>`<td>${v||""}</td>`).join("")}</tr>`;
 }
 h+=`<tr class="subtotal"><td>SUBTOTAL ${type==="Consulta externa"?"1":"2"}</td>${totals.map(v=>`<td>${v||""}</td>`).join("")}</tr></tbody></table>`;
 return {html:h,totals};
}

function buildAgeRows(rs){
 const buckets={m:0};
 for(let i=1;i<=MAX_AGE;i++)buckets[i]=0;
 const otros=[];
 rs.forEach(r=>{
   const info=ageInfo(r);
   if(!info)return;
   if(info.type==="m")buckets.m++;
   else if(info.type==="y")buckets[info.value]++;
   else otros.push(info.value);
 });
 const rows=[["0 a 11 meses",buckets.m]];
 for(let i=1;i<=MAX_AGE;i++)rows.push([`${i} ${i===1?"año":"años"}`,buckets[i]]);
 otros.sort((a,b)=>a-b);
 return{rows,otrosCount:otros.length,otrosAges:otros};
}
function groupCount(rs,field){
 const map=new Map();
 rs.forEach(r=>{
   const raw=(r[field]||"").trim();
   if(!raw)return;
   const key=raw.toLowerCase();
   if(!map.has(key))map.set(key,{label:raw,count:0});
   map.get(key).count++;
 });
 return[...map.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
}
function miniTable(rows,label){
 if(!rows.length)return`<p class="muted">Sin datos registrados este mes.</p>`;
 return`<table class="mini-table"><thead><tr><th>${label}</th><th>Cantidad</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${escapeHtml(x.label)}</td><td>${x.count}</td></tr>`).join("")}</tbody></table>`;
}

function renderReport(){
 const month=$("reportMonth").value, rs=filtered(month);
 const d=new Date(month+"-01T12:00:00");
 const label=d.toLocaleDateString("es-PE",{month:"long",year:"numeric"}).toUpperCase();
 const a=reportTable("Consulta externa",rs), b=reportTable("Hospitalización",rs);
 const grand=a.totals.map((v,i)=>v+b.totals[i]);
 const headers=["Servicio","Atend.","Total","Entrev.","V.D.","Reins.","Gest.","Interc.","Inf. social","Acta","Ficha","FESE","SIS","Consej.","Orient.","Charla","Salud","Econ.","Fam.","Viv."];
 const {rows:ageRows,otrosCount,otrosAges}=buildAgeRows(rs);
 const diagRows=groupCount(rs,"diagnosis");
 const provinceRows=groupCount(rs,"province");
 const districtRows=groupCount(rs,"district");
 const otrosLine=otrosCount
   ?`<div class="age-otros"><strong>Otros (mayores de ${MAX_AGE} años):</strong> ${otrosCount} paciente(s) — edades: ${otrosAges.join(", ")} años</div>`
   :`<div class="age-otros"><strong>Otros (mayores de ${MAX_AGE} años):</strong> 0 pacientes</div>`;
 $("reportContent").innerHTML=`
 <div class="report-title"><h2>INFORME DE PRODUCCIÓN DEL DEPARTAMENTO DE SERVICIO SOCIAL</h2><h3>UNIDAD: CONSULTA EXTERNA / HOSPITALIZACIÓN</h3></div>
 <div class="report-meta"><span>MES: <strong>${label}</strong></span><span>Total de registros: <strong>${rs.length}</strong></span></div>
 <h4>CONSULTA EXTERNA</h4>${a.html}
 <h4>HOSPITALIZACIÓN</h4>${b.html}
 <h4>TOTAL GENERAL (Subtotal 1 + Subtotal 2)</h4>
 <table class="report-table"><thead><tr>${headers.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody><tr class="grand"><td>TOTAL GENERAL</td>${grand.map(v=>`<td>${v||""}</td>`).join("")}</tr></tbody></table>
 <div class="report-page2">
   <h4>POBLACIÓN ATENDIDA POR EDAD</h4>
   <div class="age-grid">${ageRows.map(([l,c])=>`<div class="age-cell"><span>${l}</span><b>${c||""}</b></div>`).join("")}</div>
   ${otrosLine}
   <div class="report-grid-3">
     <div><h4>POR DIAGNÓSTICO</h4>${miniTable(diagRows,"Diagnóstico")}</div>
     <div><h4>POR PROVINCIA</h4>${miniTable(provinceRows,"Provincia")}</div>
     <div><h4>POR DISTRITO</h4>${miniTable(districtRows,"Distrito")}</div>
   </div>
 </div>
 <p class="muted no-print">Reporte generado por el sistema de control de atenciones.</p>`;
}

/* ---------- Impresión / PDF (orientación vertical u horizontal) ---------- */
function setPageOrientation(o,margin){
 let style=document.getElementById("dynamicPageStyle");
 if(!style){style=document.createElement("style");style.id="dynamicPageStyle";document.head.appendChild(style)}
 style.textContent=`@page{size:A4 ${o==="landscape"?"landscape":"portrait"};margin:${margin||"10mm"}}`;
}
function saveAsPdf(el,filename,orientation="portrait"){
 toast("Generando PDF...");
 const opt={margin:8,filename,image:{type:"jpeg",quality:0.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:"mm",format:"a4",orientation}};
 html2pdf().set(opt).from(el).save();
}
$("printOrientation").addEventListener("change",()=>setPageOrientation($("printOrientation").value));
setPageOrientation($("printOrientation").value);
$("printReport").onclick=()=>{setPageOrientation($("printOrientation").value);window.print()};
$("pdfReport").onclick=()=>saveAsPdf($("reportContent"),`informe-mensual-${$("reportMonth").value}.pdf`,$("printOrientation").value);

/* ---------- Acta de entrega ---------- */
let actaCurrentId="";
function fillActaSelect(){
 $("actaRecordSelect").innerHTML='<option value="">-- Seleccionar --</option>'+
   records.slice().sort((a,b)=>b.date.localeCompare(a.date))
     .map(r=>`<option value="${r.id}">${r.date} · ${escapeHtml(r.name||r.patient||"Sin nombre")}</option>`).join("");
}
function fillActaFromRecord(id){
 const r=records.find(x=>x.id===id);
 $("actaName").value=r?.name||"";
 $("actaDni").value=r?.dni||"";
 $("actaBed").value=r?.bed||"";
 $("actaBirthDate").value=r?.birthDate||"";
 $("actaAge").value=r?ageLabel(r):"";
 $("actaDiagnosis").value=r?.diagnosis||"";
 $("actaProvince").value=r?.province||"";
 $("actaDistrict").value=r?.district||"";
 const acta=r?.acta||{};
 $("actaDeliveryDate").value=acta.deliveryDate||dateNow;
 $("actaDetails").value=acta.details||"";
 $("actaObservations").value=acta.observations||"";
 $("actaDeliveredBy").value=acta.deliveredBy||"";
 $("actaReceivedBy").value=acta.receivedBy||"";
}
window.openActa=async (id="")=>{
 await loadRecords();
 fillActaSelect();
 $("actaRecordSelect").value=id;
 actaCurrentId=id;
 fillActaFromRecord(id);
 $("actaModal").classList.add("show");
};
$("actaBtn").onclick=()=>openActa("");
$("closeActa").onclick=()=>$("actaModal").classList.remove("show");
$("actaRecordSelect").onchange=e=>{actaCurrentId=e.target.value;fillActaFromRecord(actaCurrentId)};

$("actaSaveBtn").onclick=async ()=>{
 if(!actaCurrentId){toast("Selecciona una atención registrada para vincular el acta");return}
 const existing=records.find(x=>x.id===actaCurrentId);
 if(!existing){toast("Registro no encontrado");return}
 const updated={
   ...existing,
   name:$("actaName").value.trim()||existing.name,
   dni:$("actaDni").value.trim()||existing.dni,
   bed:$("actaBed").value.trim()||existing.bed,
   birthDate:$("actaBirthDate").value||existing.birthDate,
   diagnosis:$("actaDiagnosis").value.trim()||existing.diagnosis,
   province:$("actaProvince").value.trim()||existing.province,
   district:$("actaDistrict").value.trim()||existing.district,
   acta:{
     deliveryDate:$("actaDeliveryDate").value,
     details:$("actaDetails").value.trim(),
     observations:$("actaObservations").value.trim(),
     deliveredBy:$("actaDeliveredBy").value.trim(),
     receivedBy:$("actaReceivedBy").value.trim()
   }
 };
 try{
   await api("/api/records",{method:"POST",body:updated});
   await loadRecords();renderRecords();renderDashboard();
   toast("Acta guardada");
 }catch(err){toast(err.message||"No se pudo guardar el acta")}
};
$("actaPrintBtn").onclick=()=>{
 setPageOrientation("portrait","15mm");
 document.body.classList.add("printing-acta");
 window.print();
};
window.addEventListener("afterprint",()=>{
 document.body.classList.remove("printing-acta");
 if($("report").classList.contains("active")) setPageOrientation($("printOrientation").value);
});
$("actaPdfBtn").onclick=()=>{
 const name=($("actaName").value||"paciente").trim().replace(/\s+/g,"_")||"paciente";
 saveAsPdf($("actaPrintArea"),`acta-entrega-${name}.pdf`,"portrait");
};

/* ---------- Respaldo en Excel ---------- */
function recordToRow(r){
 const row={
   "ID":r.id,
   "Fecha":r.date,
   "Nombre completo":r.name||"",
   "DNI":r.dni||"",
   "Fecha de nacimiento":r.birthDate||"",
   "Edad":r.ageValue===""||r.ageValue==null?"":r.ageValue,
   "Unidad edad":r.ageUnit||"",
   "N° de cama":r.bed||"",
   "Diagnóstico":r.diagnosis||"",
   "Provincia":r.province||"",
   "Distrito":r.district||"",
   "Código / N° historia":r.patient||"",
   "Tipo de atención":r.type,
   "Servicio":r.service
 };
 ACTIONS.forEach(([k,l])=>row[l]=r.actions.includes(k)?"Sí":"");
 MORBIDITY.forEach(([k,l])=>row[l]=r.morbidity.includes(k)?"Sí":"");
 row["Acta - Fecha entrega"]=r.acta?.deliveryDate||"";
 row["Acta - Detalle"]=r.acta?.details||"";
 row["Acta - Observaciones"]=r.acta?.observations||"";
 row["Acta - Entregado por"]=r.acta?.deliveredBy||"";
 row["Acta - Recibido por"]=r.acta?.receivedBy||"";
 return row;
}
function rowToRecord(row){
 const get=k=>row[k]===undefined||row[k]===null?"":String(row[k]);
 const actaHasData=["Acta - Fecha entrega","Acta - Detalle","Acta - Observaciones","Acta - Entregado por","Acta - Recibido por"].some(k=>get(k));
 return{
   id:get("ID")||crypto.randomUUID(),
   date:get("Fecha"),
   name:get("Nombre completo"),
   dni:get("DNI"),
   birthDate:get("Fecha de nacimiento"),
   ageValue:get("Edad")===""?"":Number(get("Edad")),
   ageUnit:get("Unidad edad")||"años",
   bed:get("N° de cama"),
   diagnosis:get("Diagnóstico"),
   province:get("Provincia")||get("Procedencia"),
   district:get("Distrito"),
   patient:get("Código / N° historia"),
   type:get("Tipo de atención"),
   service:get("Servicio"),
   actions:ACTIONS.filter(([k,l])=>row[l]==="Sí").map(([k])=>k),
   morbidity:MORBIDITY.filter(([k,l])=>row[l]==="Sí").map(([k])=>k),
   acta:actaHasData?{
     deliveryDate:get("Acta - Fecha entrega"),
     details:get("Acta - Detalle"),
     observations:get("Acta - Observaciones"),
     deliveredBy:get("Acta - Entregado por"),
     receivedBy:get("Acta - Recibido por")
   }:null
 };
}
$("backupBtn").onclick=async ()=>{
 await loadRecords();
 const rows=records.map(recordToRow);
 const ws=XLSX.utils.json_to_sheet(rows);
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,ws,"Atenciones");
 XLSX.writeFile(wb,`respaldo-servicio-social-${monthNow}.xlsx`);
 toast("Respaldo exportado en Excel");
};
$("restoreInput").onchange=e=>{
 const f=e.target.files[0];if(!f)return;
 const isJson=f.name.toLowerCase().endsWith(".json");
 const rd=new FileReader();
 const finish=async recs=>{
   try{
     const r=await api("/api/records/import",{method:"POST",body:{records:recs}});
     await loadRecords();renderDashboard();renderRecords();
     toast(`Respaldo importado (${r.count} registros)`);
   }catch(err){toast(err.message||"No se pudo importar el respaldo")}
 };
 if(isJson){
   rd.onload=()=>{
     try{const x=JSON.parse(rd.result);if(!Array.isArray(x))throw 0;finish(x)}
     catch{toast("Archivo de respaldo inválido")}
   };
   rd.readAsText(f);
 }else{
   rd.onload=()=>{
     try{
       const data=new Uint8Array(rd.result);
       const wb=XLSX.read(data,{type:"array"});
       const ws=wb.Sheets[wb.SheetNames[0]];
       const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
       finish(rows.map(rowToRecord));
     }catch(err){toast("Archivo de respaldo inválido")}
   };
   rd.readAsArrayBuffer(f);
 }
 e.target.value="";
};

bootApp();
