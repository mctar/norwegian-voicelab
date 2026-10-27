'use strict';
let ownerKey = sessionStorage.getItem('norsk-admin') || '';
let ownerSession = sessionStorage.getItem('norsk-admin-session') || '';
let ownerConnected = false, ownerBusy = false, ownerSnapshot, newLabSecret;
const adminTime = epoch => epoch ? new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Oslo',dateStyle:'medium',timeStyle:'short'}).format(new Date(epoch*1000)) : '—';
const adminNumber = value => new Intl.NumberFormat('en-GB',{maximumFractionDigits:1}).format(Number(value) || 0);
const adminAgo = epoch => !epoch ? 'Never' : (ownerSnapshot.now-epoch < 60 ? 'Just now' : ownerSnapshot.now-epoch < 3600 ? `${Math.floor((ownerSnapshot.now-epoch)/60)}m ago` : adminTime(epoch));

function ownerAuthView() {
  $('admin-login').hidden = ownerConnected;
  $('admin-data').hidden = !ownerConnected;
  $('admin-lock').hidden = !ownerConnected;
  $('owner-key').value = ownerKey;
  if (!ownerConnected) {
    newLabSecret = null; $('admin-secret').hidden = true;
    for (const id of ['admin-stats','admin-keys','admin-sessions','admin-models','admin-recent','admin-chart','admin-audit']) $(id).replaceChildren();
  }
}
async function ownerRequest(path, options = {}) {
  const {noSession=false,...settings} = options;
  const response = await fetch(API+path,{...settings,headers:{Authorization:`Bearer ${ownerKey}`,
    ...(!noSession && ownerSession ? {'X-Lab-Session':ownerSession}:{}),...settings.headers}});
  let data; try {data=await response.json();} catch {data={};}
  if (!response.ok) {
    if (response.status===401 || response.status===403) {
      ownerConnected=false; ownerSession=''; sessionStorage.removeItem('norsk-admin-session');
      if (response.status===401) {ownerKey='';sessionStorage.removeItem('norsk-admin');}
      ownerAuthView(); status('admin-login-status',data.detail || 'Owner access is required.','error');
    }
    throw new Error(data.detail || `Hugin returned HTTP ${response.status}.`);
  }
  return data;
}
async function ownerConnect() {
  status('admin-login-status','Checking owner access…','busy');
  try {
    // Verify the admin role before creating an owner-console session.
    if (!ownerSession) {
      await ownerRequest('/api/admin/overview?days=1',{noSession:true});
      const session=await ownerRequest('/api/sessions',{method:'POST',noSession:true,
        headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'Owner console'})});
      ownerSession=session.id;sessionStorage.setItem('norsk-admin-session',ownerSession);
    }
    const data=await ownerRequest('/api/admin/overview?days='+$('admin-period').value);
    ownerConnected=true; sessionStorage.setItem('norsk-admin',ownerKey); ownerAuthView(); renderAdmin(data);
    status('admin-login-status','');
  } catch(error) {status('admin-login-status',error.message,'error');}
}
function adminCell(value) {return `<td>${escapeHTML(value)}</td>`;}
function adminTable(headers, rows, empty) {
  return rows.length ? `<table><thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="micro">${escapeHTML(empty)}</p>`;
}
function renderAdmin(data) {
  ownerSnapshot=data;
  const t=data.totals;
  $('admin-stats').innerHTML=[
    [t.requests,'Inference jobs'],[`${adminNumber(t.audio_in/60)} min`,'Input audio'],
    [`${adminNumber(t.audio_out/60)} min`,'Generated audio'],[t.model_requests,'Model requests'],
    [t.errors,'Jobs with errors'],[t.sessions,'Connected sessions'],
  ].map(([value,label])=>`<div class="panel admin-stat"><strong>${escapeHTML(value)}</strong><span>${escapeHTML(label)}</span></div>`).join('');
  const loaded=data.runtime.loaded_asr ? (catalogue?.asr[data.runtime.loaded_asr]?.name || data.runtime.loaded_asr) : 'No ASR model loaded';
  $('admin-runtime').textContent=`${t.running || 0} running · ${t.queued || 0} queued · ${loaded} · ${adminNumber(t.processing/60)} min server processing`;
  $('admin-updated').textContent='Updated '+adminTime(data.now)+' · Europe/Oslo';
  $('admin-tracking').textContent=`Usage starts ${adminTime(data.tracking_started)}. Usage and session history is retained for ${data.retention_days} days; recordings and transcripts are excluded.`;
  const max=Math.max(1,...data.daily.map(d=>d.requests));
  $('admin-chart').innerHTML=data.daily.map(d=>`<div class="admin-day" title="${escapeHTML(d.date)} · ${d.requests} jobs"><span>${d.requests || ''}</span><i style="height:${Math.max(2,d.requests/max*75)}px"></i><small>${escapeHTML(d.date.slice(5))}</small></div>`).join('');
  $('admin-keys').innerHTML=adminTable(['Key','Last used','Jobs','Controls'],data.keys.map(k=>`<tr><td><b>${escapeHTML(k.label)}</b><small>${escapeHTML(k.prefix)}… · ${k.revoked?'Revoked':'Active'}</small></td>${adminCell(adminAgo(k.last_used))}${adminCell(k.requests)}<td>${k.revoked ? '—' : `<div class="admin-actions"><button class="text-button" data-owner-action="rotate" data-key-id="${escapeHTML(k.id)}" data-label="${escapeHTML(k.label)}">Rotate</button><button class="text-button danger" data-owner-action="revoke" data-key-id="${escapeHTML(k.id)}" data-label="${escapeHTML(k.label)}">Revoke</button></div>`}</td></tr>`),'No lab keys.');
  $('admin-sessions').innerHTML=adminTable(['Session','Key','Last seen','Controls'],data.sessions.map(s=>`<tr><td><b>${escapeHTML(s.label)}${s.id===data.runtime.current_session?' · this console':''}</b><small>${escapeHTML(s.status)} · ${s.requests} jobs</small></td>${adminCell(s.key_label)}${adminCell(adminAgo(s.last_seen))}<td>${['connected','idle'].includes(s.status)?`<button class="text-button danger" data-owner-action="end" data-session-id="${escapeHTML(s.id)}">End session</button>`:'—'}</td></tr>`),'No browser sessions yet. API clients without a browser session are counted in usage.');
  $('admin-models').innerHTML=adminTable(['Model','Requests','Processing','Loading','Errors'],data.models.map(m=>`<tr><td><b>${escapeHTML(catalogue?.asr[m.model]?.name || m.model)}</b><small>${escapeHTML(m.stage.toUpperCase())}</small></td>${adminCell(m.requests)}${adminCell(adminNumber(m.processing)+'s')}${adminCell(m.loading==null?'—':adminNumber(m.loading)+'s')}${adminCell(m.errors)}</tr>`),'Run a lab experiment to see model usage.');
  $('admin-recent').innerHTML=adminTable(['When / task','Key / session','Status','Audio in','Server time'],data.recent.map(j=>`<tr><td><b>${escapeHTML(j.kind)}</b><small>${escapeHTML(adminTime(j.created))}</small></td><td>${escapeHTML(j.key_label)}<small>${escapeHTML(j.session_label)}</small></td>${adminCell(j.status)}${adminCell(adminNumber(j.audio_in)+'s')}<td>${escapeHTML(adminNumber(j.processing)+'s')}<small>${escapeHTML(adminNumber(j.queue)+'s queue')}</small></td></tr>`),'No inference jobs in this period.');
  $('admin-audit').innerHTML=adminTable(['When','Action','Actor'],data.audit.map(a=>`<tr>${adminCell(adminTime(a.at))}${adminCell(a.action)}${adminCell(a.actor)}</tr>`),'No key or session changes yet.');
  status('admin-status','');
}
async function refreshAdmin() {
  if (!ownerConnected || ownerBusy) return;
  try {renderAdmin(await ownerRequest('/api/admin/overview?days='+$('admin-period').value));}
  catch(error) {status('admin-status',error.message,'error');}
}
function revealLabKey(data) {
  newLabSecret=data; $('admin-secret').hidden=false;
  $('admin-secret-label').textContent=`New key · ${data.label}`;
  $('admin-new-key').value=data.key;
  status('admin-secret-status','Shown once. Save this key or download its connection file before leaving.');
}
async function ownerMutation(path, options={}) {
  ownerBusy=true;status('admin-status','Saving…','busy');
  try {
    const result=await ownerRequest(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',...options});
    if (result.key) revealLabKey(result);
    renderAdmin(await ownerRequest('/api/admin/overview?days='+$('admin-period').value));
  } catch(error) {status('admin-status',error.message,'error');}
  finally {ownerBusy=false;}
}
$('owner-form').addEventListener('submit',event=>{event.preventDefault();ownerKey=$('owner-key').value.trim();ownerSession='';ownerConnect();});
$('admin-refresh').addEventListener('click',refreshAdmin);
$('admin-period').addEventListener('change',refreshAdmin);
$('tab-admin').addEventListener('click',()=>{if(ownerKey&&!ownerConnected)ownerConnect();else if(ownerConnected)refreshAdmin();});
$('admin-key-form').addEventListener('submit',event=>{
  event.preventDefault();if(ownerBusy)return;
  const label=$('admin-key-label').value.trim();if(!label)return;
  ownerMutation('/api/admin/keys',{body:JSON.stringify({label})}).then(()=>{$('admin-key-label').value='';});
});
$('admin-data').addEventListener('click',event=>{
  const button=event.target.closest('[data-owner-action]');if(!button || ownerBusy)return;
  const action=button.dataset.ownerAction;
  if (action==='end') {
    if(confirm('End this session? Further requests will stop. Running inference may finish; the key can reconnect.'))
      ownerMutation('/api/admin/sessions/'+encodeURIComponent(button.dataset.sessionId)+'/end');
  } else if(confirm(`${action==='rotate'?'Rotate':'Revoke'} “${button.dataset.label}”? The current key and its sessions will stop immediately.${action==='rotate'?' Save the replacement key when it appears.':''}`)) {
    ownerMutation('/api/admin/keys/'+encodeURIComponent(button.dataset.keyId)+'/'+action);
  }
});
$('admin-copy-key').addEventListener('click',async()=>{
  if(!newLabSecret)return;
  try {await navigator.clipboard.writeText(newLabSecret.key);status('admin-secret-status','Key copied. Keep it private.');}
  catch {$('admin-new-key').select();status('admin-secret-status','Select and copy the key manually.');}
});
$('admin-download-key').addEventListener('click',()=>{
  if(!newLabSecret)return;
  const link='https://mctar.github.io/norwegian-voicelab/#key='+encodeURIComponent(newLabSecret.key);
  const html=`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Private Voice Lab access</title><style>body{font:18px system-ui;padding:60px;background:#f7f5ef;color:#243a36}a{color:#244e40}</style><h1>${escapeHTML(newLabSecret.label)}</h1><p><a href="${escapeHTML(link)}">Open the connected Voice Lab →</a></p><p>This file grants lab access. Keep it private.</p>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');
  a.href=url;a.download='Voice Lab - '+newLabSecret.label.replace(/[^a-z0-9 -]/gi,'').slice(0,40)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('admin-dismiss-key').addEventListener('click',()=>{newLabSecret=null;$('admin-new-key').value='';$('admin-secret').hidden=true;});
$('admin-lock').addEventListener('click',async()=>{
  try {if(ownerSession)await ownerRequest('/api/sessions/end',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch{}
  ownerConnected=false;ownerKey='';ownerSession='';ownerSnapshot=null;
  sessionStorage.removeItem('norsk-admin');sessionStorage.removeItem('norsk-admin-session');ownerAuthView();
});
setInterval(()=>{if(!document.hidden && !$('admin').hidden)refreshAdmin();},15000);
setInterval(async()=>{
  if(!ownerConnected || !ownerSession)return;
  try {await ownerRequest('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch{}
},30000);
ownerAuthView();
if(fragment.has('admin'))$('tab-admin').click();
