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
let records=JSON.parse(localStorage.getItem("social_records")||"[]");

$("today").textContent=now.toLocaleDateString("es-PE",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
$("dashMonth").value=monthNow;$("recordMonth").value=monthNow;$("reportMonth").value=monthNow;$("date").value=dateNow;

function save(){localStorage.setItem("social_records",JSON.stringify(records))}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("toast-show");setTimeout(()=>$("toast").classList.remove("toast-show"),2200)}
function monthOf(r){return r.date.slice(0,7)}
function checkedMap(keys){return Object.fromEntries(keys.map(([k])=>[k,false]))}
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

/* ---------- Navegación / menú hamburguesa ---------- */
document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>showView(btn.dataset.view)));
$("quickNew").onclick=()=>showView("new");

function closeSidebar(){document.querySelector(".sidebar").classList.remove("open");$("sidebarOverlay").classList.remove("show")}
$("hamburgerBtn").onclick=()=>{document.querySelector(".sidebar").classList.toggle("open");$("sidebarOverlay").classList.toggle("show")};
$("sidebarOverlay").onclick=closeSidebar;

function showView(view){
 closeSidebar();
 document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
 $(view).classList.add("active");
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
 const titles={dashboard:"Resumen",new:"Nueva atención",records:"Atenciones registradas",report:"Informe mensual"};
 $("pageTitle").textContent=titles[view];
 if(view==="dashboard")renderDashboard();
 if(view==="records")renderRecords();
 if(view==="report")renderReport();
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
$("attentionForm").onsubmit=e=>{
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
 const i=records.findIndex(x=>x.id===id);
 if(i>=0) records[i]=r; else records.push(r);
 save();toast(i>=0?"Atención actualizada":"Atención registrada");
 resetForm();showView("records");
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
window.deleteRecord=id=>{
 if(!confirm("¿Eliminar esta atención?"))return;
 records=records.filter(r=>r.id!==id);save();renderRecords();renderDashboard();toast("Atención eliminada");
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

function saveAsPdf(el,filename,orientation="landscape"){
 toast("Generando PDF...");
 const opt={margin:8,filename,image:{type:"jpeg",quality:0.98},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:"mm",format:"a4",orientation}};
 html2pdf().set(opt).from(el).save();
}
$("printReport").onclick=()=>window.print();
$("pdfReport").onclick=()=>saveAsPdf($("reportContent"),`informe-mensual-${$("reportMonth").value}.pdf`,"landscape");

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
window.openActa=(id="")=>{
 fillActaSelect();
 $("actaRecordSelect").value=id;
 actaCurrentId=id;
 fillActaFromRecord(id);
 $("actaModal").classList.add("show");
};
$("actaBtn").onclick=()=>openActa("");
$("closeActa").onclick=()=>$("actaModal").classList.remove("show");
$("actaRecordSelect").onchange=e=>{actaCurrentId=e.target.value;fillActaFromRecord(actaCurrentId)};

$("actaSaveBtn").onclick=()=>{
 if(!actaCurrentId){toast("Selecciona una atención registrada para vincular el acta");return}
 const i=records.findIndex(x=>x.id===actaCurrentId);
 if(i<0){toast("Registro no encontrado");return}
 records[i]={
   ...records[i],
   name:$("actaName").value.trim()||records[i].name,
   dni:$("actaDni").value.trim()||records[i].dni,
   bed:$("actaBed").value.trim()||records[i].bed,
   birthDate:$("actaBirthDate").value||records[i].birthDate,
   diagnosis:$("actaDiagnosis").value.trim()||records[i].diagnosis,
   province:$("actaProvince").value.trim()||records[i].province,
   district:$("actaDistrict").value.trim()||records[i].district,
   acta:{
     deliveryDate:$("actaDeliveryDate").value,
     details:$("actaDetails").value.trim(),
     observations:$("actaObservations").value.trim(),
     deliveredBy:$("actaDeliveredBy").value.trim(),
     receivedBy:$("actaReceivedBy").value.trim(),
     updatedAt:new Date().toISOString()
   }
 };
 save();renderRecords();renderDashboard();
 toast("Acta guardada");
};
$("actaPrintBtn").onclick=()=>{document.body.classList.add("printing-acta");window.print()};
window.addEventListener("afterprint",()=>document.body.classList.remove("printing-acta"));
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
$("backupBtn").onclick=()=>{
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
 if(isJson){
   rd.onload=()=>{
     try{const x=JSON.parse(rd.result);if(!Array.isArray(x))throw 0;records=x;save();renderDashboard();renderRecords();toast("Respaldo importado")}
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
       records=rows.map(rowToRecord);
       save();renderDashboard();renderRecords();
       toast("Respaldo importado desde Excel");
     }catch(err){toast("Archivo de respaldo inválido")}
   };
   rd.readAsArrayBuffer(f);
 }
 e.target.value="";
};

renderDashboard();
