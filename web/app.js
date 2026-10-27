'use strict';
const API = 'https://voicelab-api.btrbot.com';
const $ = id => document.getElementById(id);
let key = sessionStorage.getItem('norsk-key') || '';
let labSession = sessionStorage.getItem('norsk-session') || '';
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('key')) {
  key = fragment.get('key');
  sessionStorage.setItem('norsk-key', key);
  labSession = ''; sessionStorage.removeItem('norsk-session');
}
if (fragment.has('admin')) {
  sessionStorage.setItem('norsk-admin', fragment.get('admin'));
  sessionStorage.removeItem('norsk-admin-session');
}
if (fragment.has('key') || fragment.has('admin')) {
  history.replaceState(null, '', location.pathname + location.search);
}
let catalogue, sample, sampleURL, recorder, stream, recordingMode, recordStart, timer, animation;
let audioContext, analyser, lastComparison, currentPlayback;
let connected = false, comparing = false, speaking = false, generating = false;
let historyTurns = [], conversationResults = [];
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds = value => `${Number(value).toFixed(2)}s`;
function status(id, message, state = '') { $(id).textContent = message; $(id).className = `status ${state}`; }

async function request(path, options = {}) {
  const {noSession = false, ...settings} = options;
  const response = await fetch(API + path, {...settings, headers: {Authorization: `Bearer ${key}`,
    ...(!noSession && labSession ? {'X-Lab-Session':labSession} : {}), ...settings.headers}});
  if (!response.ok) {
    let body; try { body = await response.json(); } catch { body = {}; }
    if (response.status === 401) { connected = false; updateControls(); throw new Error('The access key was rejected. Reconnect to Hugin.'); }
    if (response.status === 403) { connected = false; updateControls(); throw new Error(body.detail || 'This session has ended. Reconnect to continue.'); }
    throw new Error(typeof body.detail === 'string' ? body.detail : `Hugin returned HTTP ${response.status}.`);
  }
  return response;
}
async function job(path, options, update) {
  const submitted = await (await request(path, options)).json();
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    const state = await (await request(`/api/jobs/${encodeURIComponent(submitted.id)}`)).json();
    if (state.status === 'done') return state.result;
    if (state.status === 'error') throw new Error(state.error);
    update(state.status === 'queued' ? 'Queued on Hugin…' : 'Running on Hugin. A cold model may take a little longer…');
  }
  throw new Error('This request is taking longer than expected. Check Hugin before submitting it again.');
}
function updateControls() {
  $('connect').classList.toggle('online', connected);
  $('connection-label').textContent = connected ? 'Connected · Hugin' : 'Connect to Hugin';
  const selected = document.querySelectorAll('#models input:checked:not(:disabled)').length;
  $('compare-run').disabled = !connected || !sample || !selected || comparing || Boolean(recordingMode);
  $('synthesize').disabled = !connected || generating;
  $('talk-record').disabled = !connected || speaking || (recordingMode && recordingMode !== 'talk');
  $('record').disabled = comparing || speaking || (recordingMode && recordingMode !== 'compare');
  $('human').disabled = speaking || Boolean(recordingMode);
  $('reset-chat').disabled = speaking || Boolean(recordingMode);
  $('audio-file').disabled = comparing || Boolean(recordingMode);
  $('public-sample').disabled = !connected || comparing || Boolean(recordingMode);
  $('disconnect').disabled = !connected;
}
function models() {
  if (!catalogue) return;
  const previous = [...document.querySelectorAll('#models input:checked')].map(e => e.value);
  const selected = previous.length ? previous : ['nb-whisper-large', 'nb-whisper-distil'];
  $('models').innerHTML = Object.entries(catalogue.asr).map(([id, m]) => {
    const compatible = m.targets.includes($('target').value) && m.styles.includes($('style').value);
    const enabled = m.available && compatible;
    return `<label class="model-card ${enabled ? '' : 'unavailable'}"><input type="checkbox" value="${escapeHTML(id)}" ${enabled ? '' : 'disabled'} ${enabled && selected.includes(id) ? 'checked' : ''}><span><b>${escapeHTML(m.name)}</b>${!m.available ? '<span class="badge">ACCESS PENDING</span>' : !compatible ? '<span class="badge">DIFFERENT STANDARD / STYLE</span>' : ''}<small>${escapeHTML(m.note)}</small><a href="https://huggingface.co/${escapeHTML(m.repo)}" target="_blank" rel="noopener noreferrer">Model card ↗</a></span></label>`;
  }).join('');
  document.querySelectorAll('#models input').forEach(e => e.addEventListener('change', updateControls));
  updateControls();
}
async function connect(newSession = false) {
  status('connect-status', 'Checking the connection…', 'busy');
  try {
    if (newSession) {labSession = ''; sessionStorage.removeItem('norsk-session');}
    if (!labSession) {
      const session = await (await request('/api/sessions', {method:'POST', noSession:true,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({label:`Browser · ${navigator.platform || 'web'}`.slice(0,80)})})).json();
      labSession = session.id; sessionStorage.setItem('norsk-session', labSession);
    }
    catalogue = await (await request('/api/catalogue')).json();
    connected = true;
    sessionStorage.setItem('norsk-key', key);
    models(); updateControls();
    $('connect-dialog').close();
    status('connect-status', '');
  } catch (error) { status('connect-status', error.message || 'Could not reach Hugin.', 'error'); }
}
$('connect').addEventListener('click', () => {$('access-key').value = key; $('connect-dialog').showModal();});
$('connect-form').addEventListener('submit', event => {event.preventDefault(); key = $('access-key').value.trim(); connect(true);});
$('disconnect').addEventListener('click', async () => {
  try {if (labSession) await request('/api/sessions/end',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});} catch {}
  connected = false; key = ''; labSession = '';
  sessionStorage.removeItem('norsk-key'); sessionStorage.removeItem('norsk-session');
  $('access-key').value = ''; $('connect-dialog').close(); updateControls();
});
setInterval(async () => {
  if (!connected || !labSession) return;
  try {await request('/api/sessions/heartbeat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}
  catch (error) {status('compare-status',error.message,'error');status('talk-status',error.message,'error');}
},30000);
$('target').addEventListener('change', models); $('style').addEventListener('change', models);
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  if (recordingMode) { status(recordingMode === 'talk' ? 'talk-status' : 'compare-status', 'Stop the recording before changing workspaces.'); return; }
  document.querySelectorAll('[data-tab]').forEach(b => {const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-selected', active);});
  document.querySelectorAll('.workspace').forEach(s => {s.hidden = s.id !== button.dataset.tab;});
  document.body.classList.toggle('admin-open', button.dataset.tab === 'admin');
  if (button.dataset.tab === 'compare') drawIdle();
}));

function drawIdle() {
  const canvas = $('waveform'), context = canvas.getContext('2d');
  canvas.width = Math.max(canvas.clientWidth, 300) * 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 65; i++) {
    const height = 5 + (Math.sin(i * 1.7) + 1) * 4 + 9 * Math.exp(-(((i - 32) / 13) ** 2)) * (1 + Math.sin(i * 2.4));
    context.fillStyle = '#b7c7b4'; context.fillRect(i * canvas.width / 65, (90 - height) / 2, 3, height);
  }
}
function drawLive() {
  if (!analyser || !recordingMode) return;
  const data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(data);
  const canvas = $('waveform'), context = canvas.getContext('2d'); context.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 65; i++) {
    const height = 3 + data[i * 2] / 255 * 80;
    context.fillStyle = '#ba5a3b'; context.fillRect(i * canvas.width / 65, (90 - height) / 2, 3, height);
  }
  animation = requestAnimationFrame(drawLive);
}
async function beginRecording(mode) {
  const statusId = mode === 'talk' ? 'talk-status' : 'compare-status';
  if (recordingMode) { recorder.stop(); return; }
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Recording needs a browser with microphone support over HTTPS. You can upload an audio file instead.');
    currentPlayback?.pause();
    stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, channelCount: 1}});
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, mimeType ? {mimeType} : {});
    recordingMode = mode;
    const chunks = [];
    recorder.ondataavailable = e => {if (e.data.size) chunks.push(e.data);};
    recorder.onstop = async () => {
      const blob = new Blob(chunks, {type: recorder.mimeType});
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timer); cancelAnimationFrame(animation);
      await audioContext?.close(); audioContext = analyser = null;
      recordingMode = null;
      $('record').classList.remove('recording'); $('talk-record').classList.remove('recording');
      $('record').innerHTML = '<span class="record-dot"></span> Record a sample';
      $('talk-record').innerHTML = '<span class="record-dot"></span> Speak to the agent';
      drawIdle();
      if (mode === 'compare') { setSample(blob, 'Microphone recording'); status('compare-status', 'Sample ready. Choose your models and compare.'); }
      else await sendTurn(blob);
      updateControls();
    };
    recorder.onerror = () => {stream.getTracks().forEach(t => t.stop()); status(statusId, 'Recording failed. Try another browser or upload a file.', 'error');};
    audioContext = new AudioContext(); analyser = audioContext.createAnalyser(); analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    recorder.start(250); recordStart = Date.now();
    const button = $(mode === 'talk' ? 'talk-record' : 'record');
    button.classList.add('recording'); button.innerHTML = '<span class="record-dot"></span> Stop recording';
    status(statusId, mode === 'talk' ? 'Listening… Press Stop recording to send your turn.' : 'Recording… Speak naturally, then stop.');
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStart) / 1000);
      $('record-clock').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')} / 01:30`;
      if (elapsed >= 89 && recorder.state === 'recording') recorder.stop();
    }, 250);
    drawLive(); updateControls();
  } catch (error) {
    stream?.getTracks().forEach(t => t.stop());
    status(statusId, error.name === 'NotAllowedError' ? 'Microphone permission was declined. Enable it in your browser, or upload a recording.' : error.message, 'error');
    recordingMode = null; updateControls();
  }
}
function setSample(blob, name) {
  sample = blob; if (sampleURL) URL.revokeObjectURL(sampleURL);
  sampleURL = URL.createObjectURL(blob); $('sample-player').src = sampleURL; $('sample-player').hidden = false;
  $('sample-label').textContent = `${name} · ${(blob.size / 1024).toFixed(0)} KB`;
  updateControls();
}
$('record').addEventListener('click', () => beginRecording('compare'));
$('talk-record').addEventListener('click', () => beginRecording('talk'));
$('audio-file').addEventListener('change', event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 12 * 1024 * 1024) {status('compare-status', 'Use an audio file smaller than 12 MB.', 'error'); return;}
  setSample(file, file.name); status('compare-status', 'Sample ready.');
});
let sampleIndex = 0;
$('public-sample').addEventListener('click', async () => {
  try {
    const manifest = await (await request('/api/samples')).json();
    if (!manifest.samples.length) throw new Error('Public samples are not configured on this server.');
    const row = manifest.samples[sampleIndex++ % manifest.samples.length];
    const blob = await (await request(`/api/samples/${row.id}`)).blob();
    setSample(blob, `FLEURS · nb_no · ${row.id}`);
    $('reference').value = row.reference; $('reference').closest('details').open = true;
    $('target').value = 'nob'; $('style').value = 'reading_optimised'; models();
    status('compare-status', 'Public sample loaded with its reference. This is read speech, not a dialect or telephone test.');
  } catch (error) { status('compare-status', error.message, 'error'); }
});
function metric(value, label, style = '') {return `<div class="metric ${style}">${escapeHTML(value)}<small>${escapeHTML(label)}</small></div>`;}
function renderResults(result) {
  $('results').innerHTML = result.results.map(row => `<article class="result-card"><header><h3>${escapeHTML(row.model)}</h3><span class="tag">${row.error ? 'UNAVAILABLE' : 'LOCAL · HUGIN'}</span></header>${row.error ? `<p class="micro">${escapeHTML(row.error)}</p>` : `<p class="transcript">${escapeHTML(row.text || '[No speech transcribed]')}</p>${row.truncated ? '<p class="status error">Generation reached its token limit. This transcript may be incomplete.</p>' : ''}<div class="metric-row">${metric(seconds(row.inference_s), 'INFERENCE')}${metric(row.rtf.toFixed(2) + '×', 'REAL-TIME FACTOR')}${metric(seconds(row.load_s), 'MODEL LOAD')}${row.score?.wer != null ? metric((row.score.wer * 100).toFixed(1) + '%', 'WORD ERROR RATE', row.score.wer < .1 ? 'good' : 'bad') : ''}</div><div>${row.score?.terms.map(t => `<span class="term ${t.found ? '' : 'missing'}">${t.found ? '✓' : '×'} ${escapeHTML(t.term)}</span>`).join('') || ''}</div><p class="micro">${escapeHTML(row.target)} · ${escapeHTML(row.style)} · ${escapeHTML(row.precision)}<br>Revision ${escapeHTML(row.revision?.slice(0, 12) || 'unknown')}</p>`}</article>`).join('') + `<div class="result-bottom"><p class="micro">${escapeHTML(result.measurement)}<br>Recording: ${seconds(result.audio_s)}${result.phone_simulation ? ' · 8 kHz bandwidth simulation' : ''}</p><button id="export-comparison" class="button secondary">Export this comparison ↓</button></div>`;
  $('export-comparison').addEventListener('click', () => downloadJSON(lastComparison, 'norsk-comparison.json'));
}
$('compare-run').addEventListener('click', async () => {
  comparing = true; updateControls(); status('compare-status', 'Sending your recording to Hugin…', 'busy');
  const body = new FormData(); body.append('file', sample, 'sample.audio');
  body.append('models', JSON.stringify([...document.querySelectorAll('#models input:checked:not(:disabled)')].map(e => e.value)));
  for (const id of ['target', 'style', 'reference', 'terms', 'keywords']) body.append(id, $(id).value);
  body.append('phone', $('phone').checked);
  const started = performance.now();
  try {
    const result = await job('/api/transcribe', {method: 'POST', body}, m => status('compare-status', m, 'busy'));
    lastComparison = {...result, client_roundtrip_s: (performance.now() - started) / 1000, tested_at: new Date().toISOString()};
    renderResults(result); status('compare-status', `Comparison complete · ${result.results.filter(r => !r.error).length} successful model(s).`);
  } catch (error) { status('compare-status', error.message, 'error'); }
  finally { comparing = false; updateControls(); }
});
function audioResult(playerId, result) {
  const player = $(playerId); player.src = `data:${result.mime};base64,${result.audio_base64}`; player.hidden = false;
  currentPlayback = player; return player;
}
document.querySelectorAll('[data-script]').forEach(button => button.addEventListener('click', () => {$('tts-text').value = button.dataset.script;}));
$('synthesize').addEventListener('click', async () => {
  generating = true; updateControls(); status('tts-status', 'Generating speech on Hugin…', 'busy');
  try {
    const result = await job('/api/synthesize', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: $('tts-text').value})}, m => status('tts-status', m, 'busy'));
    audioResult('tts-player', result);
    $('tts-metrics').innerHTML = metric(seconds(result.synthesis_s), 'SYNTHESIS') + metric(seconds(result.audio_s), 'AUDIO LENGTH') + metric(seconds(result.load_s), 'VOICE LOAD');
    status('tts-status', 'Ready to listen.');
  } catch (error) {status('tts-status', error.message, 'error');}
  finally {generating = false; updateControls();}
});
function bubble(role, text) {
  const element = document.createElement('div'); element.className = `bubble ${role}`;
  const label = document.createElement('span'); label.textContent = role === 'user' ? 'YOU · AS HEARD' : 'FJORDMOBIL';
  element.append(label, document.createTextNode(text)); $('conversation').append(element);
  $('conversation').scrollTop = $('conversation').scrollHeight;
}
async function sendTurn(blob) {
  speaking = true; updateControls(); const started = performance.now(); status('talk-status', 'Listening → thinking → speaking on Hugin…', 'busy');
  const body = new FormData(); body.append('file', blob, 'turn.audio'); body.append('model', $('agent-model').value); body.append('history', JSON.stringify(historyTurns.slice(-8)));
  try {
    const result = await job('/api/agent', {method: 'POST', body}, m => status('talk-status', m, 'busy'));
    const clientTime = (performance.now() - started) / 1000;
    bubble('user', result.heard || '[No speech transcribed]'); bubble('assistant', result.reply);
    historyTurns.push({role: 'user', content: result.heard}, {role: 'assistant', content: result.reply});
    conversationResults.push({...result, tts: {...result.tts, audio_base64: undefined}, client_roundtrip_s: clientTime});
    $('agent-metrics').innerHTML = [['Recognition', seconds(result.asr.inference_s)], ['Recognition load', seconds(result.asr.load_s)], ['Borealis2 answer', seconds(result.llm_s)], ['Speech synthesis', seconds(result.tts.synthesis_s)], ['Server turn', seconds(result.server_turn_s)], ['Network + queue + server', seconds(clientTime)]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const player = audioResult('agent-player', result.tts);
    try { await player.play(); status('talk-status', result.handoff ? 'Human handoff requested · simulated in this demo.' : 'Ready for your next turn.'); }
    catch {status('talk-status', 'Reply ready. Press Play to hear it, then speak again.');}
  } catch (error) { status('talk-status', error.message, 'error'); }
  finally {speaking = false; updateControls();}
}
$('agent-model').addEventListener('change', () => {$('chain-asr').textContent = $('agent-model').selectedOptions[0].textContent;});
$('human').addEventListener('click', () => {currentPlayback?.pause(); bubble('user', 'Jeg vil snakke med en person.'); bubble('assistant', 'Klart. Demoen markerer at du ønsker en rådgiver. Ingen ekte overføring blir gjort her.'); status('talk-status', 'Human handoff requested · simulated in this demo.');});
$('reset-chat').addEventListener('click', () => {currentPlayback?.pause(); historyTurns = []; conversationResults = []; $('conversation').replaceChildren(); bubble('assistant', 'Hei! Hva kan jeg hjelpe deg med?'); $('agent-metrics').replaceChildren(); $('agent-player').hidden = true; status('talk-status', 'New conversation.');});
function downloadJSON(value, name) {const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type: 'application/json'})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);}
window.addEventListener('beforeunload', () => {stream?.getTracks().forEach(t => t.stop());});
drawIdle(); updateControls(); if (key) connect();
