const $=id=>document.getElementById(id);
chrome.storage.sync.get({endpointUrl:"",spreadsheetId:"",sheetName:"LIVE REQUESTS",staffName:""},s=>{
  const ok=!!s.endpointUrl&&!!String(s.spreadsheetId||"").trim();
  $("status").innerHTML=ok?`<span class="ok">● Connected</span> • ${s.sheetName} • ${s.staffName||"Staff not set"}`:`<span class="err">● Google Sheets not configured</span>`;
});
$("openAssistant").onclick=()=>chrome.runtime.sendMessage({type:"OPEN_ASSISTANT",request:{__mode:"new"}});
$("options").onclick=()=>chrome.runtime.openOptionsPage();
$("live").onclick=async()=>{
  $("list").textContent="Loading…";
  const r=await chrome.runtime.sendMessage({type:"LIST_LIVE"});
  if(!r?.ok){$("list").innerHTML=`<div class="err">${r?.error||"Failed"}</div>`;return;}
  const rows=r.data.rows||[];
  $("list").innerHTML=rows.slice(0,12).map(x=>`<div class="task"><b>Room ${x.room}</b><br>${x.request}<br><span class="small">${x.status||"Pending"} • due ${x.dueAt||"-"}</span></div>`).join("")||"<div class='small'>No live requests.</div>";
};
