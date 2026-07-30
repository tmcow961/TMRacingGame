import './style.css';
import createIconElement from 'lucide/dist/esm/createElement.js';
import ArrowLeft from 'lucide/dist/esm/icons/arrow-left.js';
import CircleHelp from 'lucide/dist/esm/icons/circle-question-mark.js';
import Expand from 'lucide/dist/esm/icons/expand.js';
import Flag from 'lucide/dist/esm/icons/flag.js';
import Home from 'lucide/dist/esm/icons/house.js';
import Info from 'lucide/dist/esm/icons/info.js';
import Languages from 'lucide/dist/esm/icons/languages.js';
import Play from 'lucide/dist/esm/icons/play.js';
import RotateCcw from 'lucide/dist/esm/icons/rotate-ccw.js';
import Settings from 'lucide/dist/esm/icons/settings.js';
import { AudioManager } from './audio.js';
import { COWS, DEFAULT_SETTINGS, GAME } from './config.js';
import { createTranslator } from './i18n.js';
import { InputManager } from './input.js';
import { GameWorld } from './world.js';
import sourceManifest from './data/sources.json' with { type: 'json' };

const app = document.querySelector('#app');
app.className = 'app';
app.innerHTML = '<div id="ui"></div>';
const ui = document.querySelector('#ui');
const settings = { ...DEFAULT_SETTINGS };
const t = createTranslator(() => settings.language);
const input = new InputManager();
const audio = new AudioManager(settings);
const world = new GameWorld(app, settings, audio);

const state = {
  screen: 'loading', previousScreen: 'title', direction: 1, cow: COWS[0],
  controlsSeen: false, raceTime: 0, countdown: 4, running: false,
  finalPlace: 1, finalTime: 0, notificationUntil: 0, fps: 60, hudAccumulator: 1,
};

if (import.meta.env.DEV) Object.defineProperty(window, '__TMR_DEBUG__', { value: { world, state } });

const iconSet = { 'arrow-left': ArrowLeft, 'circle-help': CircleHelp, expand: Expand, flag: Flag, home: Home, info: Info, languages: Languages, play: Play, 'rotate-ccw': RotateCcw, settings: Settings };
const icons = () => document.querySelectorAll('[data-lucide]').forEach((placeholder) => {
  const icon = iconSet[placeholder.dataset.lucide];
  if (!icon) return;
  const element = createIconElement(icon, { 'aria-hidden': 'true', class: 'lucide' });
  placeholder.replaceWith(element);
});
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${String(Math.floor((seconds % 1) * 10))}`;
const clockMarkup = () => `<div class="race-clock" id="race-clock"><div class="clock-face" aria-hidden="true"><span class="clock-number n12">12</span><span class="clock-number n3">3</span><span class="clock-number n6">6</span><span class="clock-number n9">9</span><span class="clock-hand hour" id="clock-hour"></span><span class="clock-hand minute" id="clock-minute"></span><span class="clock-pin"></span></div><div class="clock-readout"><strong id="clock-time">12:00 AM</strong><span class="clock-status hidden" id="clock-status"></span></div></div>`;
const collisionKey = { obstacle: 'collisionObstacle', racer: 'collisionRacer', rail: 'collisionRail' };
const recoveryKey = { 'off-track': 'recoveryOffTrack', fallen: 'recoveryFallen', stuck: 'recoveryStuck' };
let raceStartLocked = false;

function showRaceNotification(message, kind) {
  const notice = document.querySelector('#recovery');
  if (!notice) return;
  notice.textContent = message;
  notice.className = `recovery race-notification ${kind}`;
  state.notificationUntil = performance.now() + 1200;
}

function mountDiagnostics() {
  if (document.querySelector('#diagnostics-panel')) return;
  ui.insertAdjacentHTML('beforeend', `<aside class="diagnostics-panel hidden" id="diagnostics-panel" aria-label="${t('diagnostics')}"><div class="diagnostics-title">${t('diagnostics')}</div><dl><div><dt>${t('diagRequested')}</dt><dd id="diag-requested">--</dd></div><div><dt>${t('diagActual')}</dt><dd id="diag-actual">--</dd></div><div><dt>${t('diagVelocity')}</dt><dd id="diag-velocity">--</dd></div><div><dt>${t('diagContacts')}</dt><dd id="diag-contacts">--</dd></div><div><dt>${t('diagFps')}</dt><dd id="diag-fps">--</dd></div><div><dt>${t('diagMovement')}</dt><dd id="diag-movement">--</dd></div><div><dt>${t('diagStuck')}</dt><dd id="diag-stuck">--</dd></div><div><dt>${t('diagLateral')}</dt><dd id="diag-lateral">--</dd></div><div><dt>${t('diagRaceDistance')}</dt><dd id="diag-race-distance">--</dd></div><div><dt>${t('diagTrackLocation')}</dt><dd id="diag-track-location">--</dd></div><div><dt>${t('diagLocalPosition')}</dt><dd id="diag-local-position">--</dd></div><div><dt>${t('diagCollision')}</dt><dd id="diag-collision">${t('diagNone')}</dd></div><div><dt>${t('diagCollisionLocation')}</dt><dd id="diag-collision-location">${t('diagNone')}</dd></div><div><dt>${t('diagCollisionAge')}</dt><dd id="diag-collision-age">${t('diagNone')}</dd></div><div><dt>${t('diagRecovery')}</dt><dd id="diag-recovery">${t('diagNone')}</dd></div></dl></aside>`);
  document.querySelector('#diagnostics-panel').classList.toggle('hidden', !settings.diagnostics);
}

function setDiagnostics(enabled) {
  settings.diagnostics = enabled;
  document.querySelector('#diagnostics-panel')?.classList.toggle('hidden', !enabled);
  document.querySelectorAll('[data-diagnostics]').forEach((button) => button.classList.toggle('active', String(enabled) === button.dataset.diagnostics));
}

function updateDiagnostics() {
  const panel = document.querySelector('#diagnostics-panel');
  if (!panel || !settings.diagnostics) return;
  const data = world.getDiagnostics();
  if (!data) return;
  const set = (id, value) => { const element = document.querySelector(id); if (element) element.textContent = value; };
  set('#diag-requested', data.requestedSpeed.toFixed(1));
  set('#diag-actual', data.actualForwardSpeed.toFixed(1));
  set('#diag-velocity', data.bodyForwardSpeed.toFixed(1));
  set('#diag-contacts', String(data.activeContacts));
  set('#diag-fps', state.fps.toFixed(0));
  set('#diag-movement', `${data.forwardMovement.toFixed(1)} m`);
  set('#diag-stuck', `${data.stuckTimer.toFixed(1)} / 3.0 s`);
  set('#diag-lateral', `${data.lateral.toFixed(1)} / +/-${data.trackLimit.toFixed(1)} m`);
  set('#diag-race-distance', `${data.raceDistance.toFixed(1)} / ${data.trackLength.toFixed(0)} m`);
  set('#diag-track-location', `TM+${data.trackDistance.toFixed(1)} m`);
  set('#diag-local-position', `${data.localPosition.x.toFixed(1)}, ${data.localPosition.y.toFixed(1)}, ${data.localPosition.z.toFixed(1)}`);
  set('#diag-collision', data.lastCollision ? `${t(collisionKey[data.lastCollision.type] ?? 'diagNone')} (${data.lastCollision.force.toFixed(0)} N)` : t('diagNone'));
  set('#diag-collision-location', data.lastCollision ? `TM+${data.lastCollision.trackDistance.toFixed(1)} m; ${data.lastCollision.localPosition.x.toFixed(1)}, ${data.lastCollision.localPosition.y.toFixed(1)}, ${data.lastCollision.localPosition.z.toFixed(1)}` : t('diagNone'));
  set('#diag-collision-age', data.lastCollision ? `${Math.max(0, data.clockTime-data.lastCollision.time).toFixed(1)} s` : t('diagNone'));
  set('#diag-recovery', data.lastRecovery ? t(recoveryKey[data.lastRecovery.reason] ?? 'diagNone') : t('diagNone'));
}
const alternateDirection = (direction) => settings.language === 'en' ? (direction === 1 ? '屯門往荃灣' : '荃灣往屯門') : (direction === 1 ? 'Tuen Mun to Tsuen Wan' : 'Tsuen Wan to Tuen Mun');

function topActions() {
  return `<div class="top-actions">
    <button class="icon-btn" data-action="language" title="Language / 語言"><i data-lucide="languages"></i></button>
    <button class="icon-btn" data-action="settings" title="${t('settings')}"><i data-lucide="settings"></i></button>
  </div>`;
}

function renderLoading(progress = .1, error = false) {
  ui.innerHTML = `<section class="screen loading"><div><div class="brand-kicker">TMR 2026</div><h1>${t('gameTitle')}</h1><p>${error ? t('loadingError') : `${t('loading')}...`}</p>${error ? `<button class="btn primary" data-action="reload">${t('retryLoad')}</button>` : `<div class="loader-track"><div class="loader-fill" style="width:${progress * 100}%"></div></div>`}</div></section>`;
}

function renderTitle() {
  state.screen = 'title'; world.mode = 'menu'; world.setBusLaneVisual(false); input.enabled = false; audio.stopMusic();
  ui.innerHTML = `${topActions()}<section class="screen"><div class="panel title-panel">
    <div class="brand-kicker">${t('grandPrix')}</div><h1>${t('gameTitle')}</h1><p class="tagline">${t('tagline')}</p>
    <div class="menu-stack"><button class="btn primary" data-action="direction"><i data-lucide="play"></i> ${t('startRace')}</button><button class="btn" data-action="settings"><i data-lucide="settings"></i> ${t('settings')}</button><button class="btn" data-action="credits"><i data-lucide="info"></i> ${t('credits')}</button></div>
  </div></section>`; bind();
}

const routeSvg = (reverse = false) => {const points=world.track.minimapPath(380,100,10);const path=points.map((point,index)=>`${index?'L':'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');return `<div class="route-line"><svg viewBox="0 0 380 100" aria-label="${t('routePreview')}"><path d="${path}" ${reverse ? 'transform="translate(380 0) scale(-1 1)"' : ''}/></svg><span class="route-arrow">${reverse ? '←' : '→'}</span></div>`;};

function renderDirection() {
  state.screen = 'direction'; world.mode = 'menu';
  ui.innerHTML = `${topActions()}<section class="screen"><div class="panel"><h2>${t('chooseDirection')}</h2><div class="selection-grid">
    <button class="choice ${state.direction === 1 ? 'selected' : ''}" data-direction="1"><div class="brand-kicker">Route 01</div><h3>${t('outbound')}</h3><div>${alternateDirection(1)}</div>${routeSvg()}</button>
    <button class="choice ${state.direction === -1 ? 'selected' : ''}" data-direction="-1"><div class="brand-kicker">Route 02</div><h3>${t('inbound')}</h3><div>${alternateDirection(-1)}</div>${routeSvg(true)}</button>
  </div><div class="footer-actions"><button class="btn" data-action="title"><i data-lucide="arrow-left"></i> ${t('back')}</button><button class="btn primary" data-action="cow">${t('continue')} →</button></div></div></section>`; bind();
}

function renderCow() {
  state.screen = 'cow'; world.mode = 'menu'; world.setPreviewCow(state.cow);
  ui.innerHTML = `${topActions()}<section class="screen"><div class="panel"><h2>${t('chooseCow')}</h2><div class="cow-grid">${COWS.map((cow) => `<button class="cow-choice ${cow.id === state.cow.id ? 'selected' : ''}" data-cow="${cow.id}" aria-pressed="${cow.id === state.cow.id}"><div class="cow-swatch ${cow.spotted ? 'spotted' : ''}" style="--cow:#${cow.color.toString(16).padStart(6,'0')};--accent:#${cow.secondary.toString(16).padStart(6,'0')}"></div><strong>${t(cow.id)}</strong></button>`).join('')}</div><div class="footer-actions"><button class="btn" data-action="direction"><i data-lucide="arrow-left"></i> ${t('back')}</button><button class="btn primary" data-action="prepare"><i data-lucide="flag"></i> ${t('raceNow')}</button></div></div></section>`; bind();
}

function controlsMarkup(fromPause = false) {
  return `<section class="screen modal-screen"><div class="modal"><h2>${t('controls')}</h2><p>${t('controlsHint')}</p><div class="control-list">
    <div class="control-row"><span>${t('accelerate')}</span><span><kbd>W</kbd> / <kbd>↑</kbd></span></div>
    <div class="control-row"><span>${t('steer')}</span><span><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></span></div>
    <div class="control-row"><span>${t('brake')}</span><span><kbd>S</kbd> / <kbd>↓</kbd></span></div>
    <div class="control-row"><span>${t('jump')}</span><kbd>Space</kbd></div><div class="control-row"><span>${t('pause')}</span><kbd>Esc</kbd></div>
  </div><button class="btn primary" data-action="${fromPause ? 'pause' : 'begin'}">${fromPause ? t('back') : t('gotIt')}</button></div></section>`;
}

function renderControls(fromPause = false) { state.screen = fromPause ? 'controlsPause' : 'controls'; ui.innerHTML = controlsMarkup(fromPause); bind(); }

function beginRace() {
  if (raceStartLocked || state.screen === 'race') return;
  const previousScreen = state.screen;
  raceStartLocked = true;
  input.enabled = false;
  input.reset();
  world.setRaceRunning(false);
  try {
    world.startRace(state.direction,state.cow);
    world.setRaceRunning(false);
    state.screen='race'; state.raceTime=0; state.countdown=4; state.running=false; state.notificationUntil=0;
    ui.innerHTML = `<div class="hud"><div class="hud-cluster"><div class="hud-box"><div class="hud-label">${t('position')}</div><div class="hud-value" id="position">1 / 6</div></div><div class="hud-box"><div class="hud-label">${t('progress')}</div><div class="hud-value" id="progress">0%</div></div><div class="hud-box"><div class="hud-label">${t('time')}</div><div class="hud-value" id="race-time">00:00.0</div></div><div class="hud-box lives-box"><div class="hud-label">${t('lives')}</div><div class="hud-value" id="lives">${GAME.playerLives} / ${GAME.playerLives}</div></div></div>${clockMarkup()}<div class="hud-box hud-route"><div class="hud-label">${t('destination')}</div><div class="hud-value">${state.direction === 1 ? t('outboundShort') : t('inboundShort')}</div></div><div class="hud-box jump-meter"><div class="hud-label" id="jump-label">${t('jumpReady')}</div><div class="jump-bar"><div class="jump-fill" id="jump-fill"></div></div></div><canvas class="minimap" id="minimap" width="420" height="240"></canvas></div><div class="countdown" id="countdown">3</div><div class="recovery hidden" id="recovery">${t('recovering')}</div>`;
    mountDiagnostics();drawMinimap();input.enabled=true;
  } catch (error) {
    state.screen=previousScreen;state.running=false;world.setRaceRunning(false);input.enabled=false;
    console.error('Race restart failed',error);
  } finally {
    queueMicrotask(() => { raceStartLocked = false; });
  }
}

function renderPause() {
  state.screen='pause';state.running=false;world.setRaceRunning(false);audio.pauseMusic();
  ui.insertAdjacentHTML('beforeend',`<section class="screen modal-screen" id="pause-overlay"><div class="modal"><div class="brand-kicker">${t('pause')}</div><h2>${t('paused')}</h2><div class="menu-stack"><button class="btn primary" data-action="resume"><i data-lucide="play"></i> ${t('resume')}</button><button class="btn" data-action="restart"><i data-lucide="rotate-ccw"></i> ${t('restart')}</button><button class="btn" data-action="controls-pause"><i data-lucide="circle-help"></i> ${t('controls')}</button><button class="btn" data-action="settings"><i data-lucide="settings"></i> ${t('settings')}</button><button class="btn danger" data-action="title"><i data-lucide="home"></i> ${t('quit')}</button></div></div></section>`);bind();
}

function renderCowInterchange(stop) {
  if (state.screen !== 'race') return;
  state.screen = 'interchange';
  state.running = false;
  world.setRaceRunning(false);
  input.enabled = false;
  audio.pauseMusic();
  ui.insertAdjacentHTML('beforeend', `<section class="screen modal-screen" id="interchange-overlay"><div class="modal interchange-modal"><div class="brand-kicker">${t('cowInterchangeStop')} · TM+${stop.distance.toFixed(0)} m</div><h2>${stop.labelEn}</h2><p class="interchange-zh">${stop.labelZh}</p><p class="interchange-copy">${t('cowInterchangePrompt')}</p><div class="cow-grid interchange-cow-grid">${COWS.map((cow) => `<button class="cow-choice ${cow.id === state.cow.id ? 'selected' : ''}" data-interchange-cow="${cow.id}" aria-pressed="${cow.id === state.cow.id}"><div class="cow-swatch ${cow.spotted ? 'spotted' : ''}" style="--cow:#${cow.color.toString(16).padStart(6,'0')};--accent:#${cow.secondary.toString(16).padStart(6,'0')}"></div><strong>${t(cow.id)}</strong></button>`).join('')}</div><div class="footer-actions interchange-actions"><span></span><button class="btn primary" data-action="leave-interchange"><i data-lucide="play"></i> ${t('cowInterchangeResume')}</button></div></div></section>`);
  bind();
}

function leaveCowInterchange() {
  document.querySelector('#interchange-overlay')?.remove();
  state.screen = 'race';
  state.running = true;
  world.setRaceRunning(true);
  input.enabled = true;
  audio.startMusic();
}

function resumeRace() { document.querySelector('#pause-overlay')?.remove(); state.screen='race';state.running=state.countdown<=0;world.setRaceRunning(state.running);if(state.running)audio.startMusic();input.enabled=true; }

function finishRace() {
  if(state.screen!=='race')return;
  state.running=false;world.setRaceRunning(false);audio.stopMusic();audio.play('finish');
  const standings=world.getStandings();state.finalPlace=Math.max(1,standings.findIndex((r)=>r.isPlayer)+1);state.finalTime=state.raceTime;state.screen='results';input.enabled=false;
  ui.innerHTML=`<section class="screen modal-screen"><div class="modal"><div class="brand-kicker">${t('finished')}</div><p class="result-place">${t(['first','second','third','fourth','fifth','sixth'][state.finalPlace-1])}</p><div class="result-stats"><div class="result-stat"><div class="hud-label">${t('time')}</div><div class="hud-value">${formatTime(state.finalTime)}</div></div><div class="result-stat"><div class="hud-label">${t('route')}</div><strong>${state.direction===1?t('outbound'):t('inbound')}</strong></div><div class="result-stat"><div class="hud-label">${t('cow')}</div><strong>${t(state.cow.id)}</strong></div><div class="result-stat"><div class="hud-label">${t('progress')}</div><strong>100%</strong></div></div><div class="footer-actions"><button class="btn" data-action="title"><i data-lucide="home"></i> ${t('returnTitle')}</button><button class="btn primary" data-action="retry"><i data-lucide="rotate-ccw"></i> ${t('retry')}</button></div></div></section>`;bind();
}

function busLaneGameOver() {
  if(state.screen!=='race')return;
  state.running=false;world.setRaceRunning(false);audio.stopMusic();audio.play('hit');state.screen='gameover';input.enabled=false;
  ui.innerHTML=`<section class="screen modal-screen"><div class="modal"><div class="brand-kicker danger-kicker">${t('gameOver')}</div><h2>${t('busLaneViolation')}</h2><div class="result-stats"><div class="result-stat"><div class="hud-label">${t('time')}</div><div class="hud-value">${formatTime(state.raceTime)}</div></div><div class="result-stat"><div class="hud-label">${t('progress')}</div><strong>${Math.min(100,Math.floor((world.racers[0]?.progress??0)*100))}%</strong></div></div><div class="footer-actions"><button class="btn" data-action="title"><i data-lucide="home"></i> ${t('returnTitle')}</button><button class="btn primary" data-action="retry"><i data-lucide="rotate-ccw"></i> ${t('retry')}</button></div></div></section>`;bind();
}

function obstacleGameOver() {
  if(state.screen!=='race')return;
  state.running=false;world.setRaceRunning(false);audio.stopMusic();audio.play('hit');state.screen='gameover';input.enabled=false;
  ui.innerHTML=`<section class="screen modal-screen"><div class="modal"><div class="brand-kicker danger-kicker">${t('gameOver')}</div><h2>${t('obstacleGameOver')}</h2><div class="result-stats"><div class="result-stat"><div class="hud-label">${t('time')}</div><div class="hud-value">${formatTime(state.raceTime)}</div></div><div class="result-stat"><div class="hud-label">${t('progress')}</div><strong>${Math.min(100,Math.floor((world.racers[0]?.progress??0)*100))}%</strong></div></div><div class="footer-actions"><button class="btn" data-action="title"><i data-lucide="home"></i> ${t('returnTitle')}</button><button class="btn primary" data-action="retry"><i data-lucide="rotate-ccw"></i> ${t('retry')}</button></div></div></section>`;bind();
}

function renderSettings() {
  state.previousScreen=state.screen;const active=(name)=>settings.quality===name?'active':'';
  ui.insertAdjacentHTML('beforeend',`<section class="screen modal-screen" id="settings-overlay"><div class="modal"><div class="brand-kicker">${t('settings')}</div><h2>${t('settings')}</h2><div class="settings-list">
    <div class="setting-row"><span>Language / 語言</span><div class="segmented"><button class="${settings.language==='en'?'active':''}" data-language="en">English</button><button class="${settings.language==='zh'?'active':''}" data-language="zh">繁體中文</button></div></div>
    <label class="setting-row"><span>${t('masterVolume')}</span><input data-setting="master" type="range" min="0" max="1" step=".05" value="${settings.master}"></label><label class="setting-row"><span>${t('musicVolume')}</span><input data-setting="music" type="range" min="0" max="1" step=".05" value="${settings.music}"></label><label class="setting-row"><span>${t('sfxVolume')}</span><input data-setting="sfx" type="range" min="0" max="1" step=".05" value="${settings.sfx}"></label>
    <div class="setting-row"><span>${t('quality')}</span><div class="segmented"><button class="${active('low')}" data-quality="low">${t('low')}</button><button class="${active('medium')}" data-quality="medium">${t('medium')}</button><button class="${active('high')}" data-quality="high">${t('high')}</button></div></div>
    <div class="setting-row"><span>${t('reducedMotion')}</span><div class="segmented two"><button class="${settings.reducedMotion?'active':''}" data-motion="true">${t('on')}</button><button class="${!settings.reducedMotion?'active':''}" data-motion="false">${t('off')}</button></div></div>
    <div class="setting-row"><span>${t('diagnostics')}</span><div class="segmented two"><button class="${settings.diagnostics?'active':''}" data-diagnostics="true">${t('on')}</button><button class="${!settings.diagnostics?'active':''}" data-diagnostics="false">${t('off')}</button></div></div><button class="btn" data-action="fullscreen"><i data-lucide="expand"></i> ${document.fullscreenElement?t('exitFullscreen'):t('enterFullscreen')}</button></div><div class="footer-actions"><span></span><button class="btn primary" data-action="close-settings">${t('close')}</button></div></div></section>`);bind();
}

function renderCredits(){const sources=sourceManifest.sources.map((source)=>`<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a><span>${source.attribution} · ${source.license}</span></li>`).join('');state.screen='credits';ui.innerHTML=`${topActions()}<section class="screen"><div class="modal credits-modal"><div class="brand-kicker">TMR 2026</div><h2>${t('creditsTitle')}</h2><p class="credits-copy">${t('creditsBody')}</p><ul class="source-list">${sources}</ul><p class="credits-copy">Three.js · Rapier · Howler.js · Lucide · Vite</p><button class="btn primary" data-action="title"><i data-lucide="arrow-left"></i> ${t('back')}</button></div></section>`;bind();}

function drawMinimap(){const canvas=document.querySelector('#minimap');if(!canvas)return;const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const path=world.track.minimapPath(w,h,22);ctx.strokeStyle='#d9e8df';ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();const pointAt=(progress)=>{const rp=state.direction===1?progress:1-progress;return path[Math.max(0,Math.min(path.length-1,Math.round(rp*(path.length-1))))];};const start=pointAt(0),finish=pointAt(1);ctx.fillStyle='#f2c94c';ctx.fillRect(start.x-7,start.y-7,14,14);ctx.fillStyle='#fff';ctx.fillRect(finish.x-7,finish.y-7,14,14);for(const stop of world.track.cowStops){const raceProgress=state.direction===1?stop.progress:1-stop.progress;const p=pointAt(raceProgress);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#20b878';ctx.fillRect(-7,-7,14,14);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(-7,-7,14,14);ctx.restore();}world.racers.forEach((r)=>{const p=pointAt(r.progress);ctx.beginPath();ctx.arc(p.x,p.y,r.isPlayer?8:5,0,Math.PI*2);ctx.fillStyle=r.isPlayer?'#e75148':'#174e58';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();});}

function updateAnalogClock(){const hourHand=document.querySelector('#clock-hour');if(!hourHand)return;const simulatedMinutes=(state.raceTime/GAME.clockDayDuration*1440)%1440;const minuteHand=document.querySelector('#clock-minute');hourHand.style.transform=`translateX(-50%) rotate(${simulatedMinutes*.5}deg)`;minuteHand.style.transform=`translateX(-50%) rotate(${(simulatedMinutes%60)*6}deg)`;const hour24=Math.floor(simulatedMinutes/60);const minute=Math.floor(simulatedMinutes%60);const suffix=hour24<12?'AM':'PM';const hour12=hour24%12||12;document.querySelector('#clock-time').textContent=`${hour12}:${String(minute).padStart(2,'0')} ${suffix}`;const status=world.getBusLaneStatus();const panel=document.querySelector('#race-clock');const statusElement=document.querySelector('#clock-status');panel.classList.toggle('bus-active',status.active);statusElement.classList.toggle('hidden',!status.active);if(status.active)statusElement.textContent=status.playerInBusLane?`${t('busLaneLeave')} ${Math.max(0,status.graceTime-status.violationTime).toFixed(1)}s`:t('busLaneActive');}

function updateHud(){const player=world.racers[0];if(!player)return;const standings=world.getStandings();const place=standings.findIndex((r)=>r.isPlayer)+1;document.querySelector('#position').textContent=`${place} / 6`;document.querySelector('#progress').textContent=`${Math.min(100,Math.floor(player.progress*100))}%`;document.querySelector('#race-time').textContent=formatTime(state.raceTime);const lives=document.querySelector('#lives');if(lives)lives.textContent=`${world.playerLives} / ${GAME.playerLives}`;const fill=document.querySelector('#jump-fill');const label=document.querySelector('#jump-label');if(player.airborne){label.textContent=t('airborne');fill.style.transform='scaleX(0)';}else if(player.jumpCooldown>0){label.textContent=`${t('cooldown')} ${player.jumpCooldown.toFixed(1)}s`;fill.style.transform=`scaleX(${1-player.jumpCooldown/GAME.jumpCooldown})`;}else{label.textContent=t('jumpReady');fill.style.transform='scaleX(1)';}const notice=document.querySelector('#recovery');notice?.classList.toggle('hidden',performance.now()>state.notificationUntil);updateDiagnostics();drawMinimap();}

function bind(){
  icons();
  ui.querySelectorAll('[data-direction]').forEach((button)=>button.addEventListener('click',()=>{state.direction=Number(button.dataset.direction);audio.play('ui');renderDirection();}));
  ui.querySelectorAll('[data-cow]').forEach((button)=>button.addEventListener('click',()=>{state.cow=COWS.find((c)=>c.id===button.dataset.cow);audio.play('ui');renderCow();}));
  ui.querySelectorAll('[data-interchange-cow]').forEach((button)=>button.addEventListener('click',()=>{state.cow=COWS.find((c)=>c.id===button.dataset.interchangeCow);world.changePlayerCow(state.cow);audio.play('ui');ui.querySelectorAll('[data-interchange-cow]').forEach((choice)=>{const selected=choice.dataset.interchangeCow===state.cow.id;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected));});}));
  ui.querySelectorAll('[data-setting]').forEach((slider)=>slider.addEventListener('input',()=>{settings[slider.dataset.setting]=Number(slider.value);audio.applyVolumes();}));
  ui.querySelectorAll('[data-quality]').forEach((button)=>button.addEventListener('click',()=>{settings.quality=button.dataset.quality;world.applyQuality();document.querySelectorAll('[data-quality]').forEach((b)=>b.classList.toggle('active',b===button));}));
  ui.querySelectorAll('[data-motion]').forEach((button)=>button.addEventListener('click',()=>{settings.reducedMotion=button.dataset.motion==='true';document.querySelectorAll('[data-motion]').forEach((b)=>b.classList.toggle('active',b===button));}));
  ui.querySelectorAll('[data-diagnostics]').forEach((button)=>button.addEventListener('click',()=>setDiagnostics(button.dataset.diagnostics==='true')));
  ui.querySelectorAll('[data-language]').forEach((button)=>button.addEventListener('click',()=>{settings.language=button.dataset.language;document.querySelector('#settings-overlay')?.remove();renderSettings();}));
}

function closeSettings(){document.querySelector('#settings-overlay')?.remove();if(state.previousScreen==='title')renderTitle();else if(state.previousScreen==='direction')renderDirection();else if(state.previousScreen==='cow')renderCow();}

function handleAction(action){const actions={title:renderTitle,direction:renderDirection,cow:renderCow,credits:renderCredits,settings:renderSettings,'close-settings':closeSettings,prepare:()=>state.controlsSeen?beginRace():renderControls(false),begin:()=>{state.controlsSeen=true;beginRace();},retry:beginRace,resume:resumeRace,restart:beginRace,'leave-interchange':leaveCowInterchange,'controls-pause':()=>renderControls(true),pause:()=>{renderRaceBase();renderPause();},language:()=>{settings.language=settings.language==='en'?'zh':'en';if(state.screen==='title')renderTitle();else if(state.screen==='direction')renderDirection();else if(state.screen==='cow')renderCow();else renderTitle();},fullscreen:()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(),reload:()=>location.reload()};const handler=actions[action];if(!handler)return;audio.play('ui');handler();}

ui.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest('[data-action]'):null;if(!target||!ui.contains(target)||target.disabled)return;handleAction(target.dataset.action);});

function renderRaceBase(){state.screen='race';ui.innerHTML = `<div class="hud"><div class="hud-cluster"><div class="hud-box"><div class="hud-label">${t('position')}</div><div class="hud-value" id="position">1 / 6</div></div><div class="hud-box"><div class="hud-label">${t('progress')}</div><div class="hud-value" id="progress">0%</div></div><div class="hud-box"><div class="hud-label">${t('time')}</div><div class="hud-value" id="race-time">${formatTime(state.raceTime)}</div></div><div class="hud-box lives-box"><div class="hud-label">${t('lives')}</div><div class="hud-value" id="lives">${world.playerLives} / ${GAME.playerLives}</div></div></div>${clockMarkup()}<div class="hud-box hud-route"><div class="hud-label">${t('destination')}</div><div class="hud-value">${state.direction===1?t('outboundShort'):t('inboundShort')}</div></div><div class="hud-box jump-meter"><div class="hud-label" id="jump-label">${t('jumpReady')}</div><div class="jump-bar"><div class="jump-fill" id="jump-fill"></div></div></div><canvas class="minimap" id="minimap" width="420" height="240"></canvas></div><div class="recovery hidden" id="recovery">${t('recovering')}</div>`;mountDiagnostics();updateHud();updateAnalogClock();}

input.onPause=()=>{if(state.screen==='race')renderPause();else if(state.screen==='pause')resumeRace();};
world.onPlayerFinish=finishRace;
world.onBusLaneGameOver=busLaneGameOver;
world.onObstacleGameOver=obstacleGameOver;
world.onPlayerLifeLost=({remaining,total})=>{audio.play('hit');showRaceNotification(`${t('lifeLost')} · ${remaining} / ${total}`,'life');};
world.onCollision=(details)=>showRaceNotification(t(collisionKey[details.type]??'collisionObstacle'),'collision');
world.onRecovery=(reason)=>showRaceNotification(t(recoveryKey[reason]??'recovering'),'recovery');
world.onCowInterchangeApproach=(_stop,{leftmostRequired})=>showRaceNotification(t(leftmostRequired?'cowInterchangeLeftLane':'cowInterchangeApproach'),'interchange');
world.onCowInterchange=renderCowInterchange;
window.addEventListener('blur',()=>{if(state.screen==='race'&&state.running)renderPause();});
window.addEventListener('keydown',(event)=>{if(event.code!=='F3'||event.repeat)return;event.preventDefault();setDiagnostics(!settings.diagnostics);});
window.addEventListener('keydown',(event)=>{if(input.enabled||!['ArrowDown','ArrowRight','KeyS','KeyD','ArrowUp','ArrowLeft','KeyW','KeyA'].includes(event.code))return;const buttons=[...ui.querySelectorAll('button:not([disabled])')].filter((button)=>button.offsetParent!==null);if(!buttons.length)return;event.preventDefault();const current=buttons.indexOf(document.activeElement);const backwards=['ArrowUp','ArrowLeft','KeyW','KeyA'].includes(event.code);buttons[(current+(backwards?-1:1)+buttons.length)%buttons.length].focus();});

let last=performance.now();let accumulator=0;
const MAX_FRAME_DELTA=.1;const MAX_PHYSICS_STEPS=8;
function frame(now){const rawDelta=Math.max(.001,(now-last)/1000);const delta=Math.min(MAX_FRAME_DELTA,rawDelta);last=now;accumulator+=delta;state.fps+=(Math.min(240,1/rawDelta)-state.fps)*.08;state.hudAccumulator+=delta;
  if(state.screen==='race'){
    if(state.countdown>0){state.countdown-=delta;const count=document.querySelector('#countdown');if(count){const value=Math.ceil(state.countdown);count.textContent=value>0?Math.min(3,value):t('go');}if(state.countdown<=0){if(count)setTimeout(()=>count.remove(),650);state.running=true;world.setRaceRunning(true);audio.startMusic();audio.play('go');}else if(Math.ceil(state.countdown)!==Math.ceil(state.countdown+delta))audio.play('count');}
    let steps=0;
    while(accumulator>=GAME.fixedStep&&steps<MAX_PHYSICS_STEPS){if(state.running)state.raceTime+=GAME.fixedStep;world.update(GAME.fixedStep,state.raceTime,input);accumulator-=GAME.fixedStep;steps+=1;}
    if(steps===MAX_PHYSICS_STEPS&&accumulator>=GAME.fixedStep)accumulator=0;
    if(state.hudAccumulator>=.1){updateHud();state.hudAccumulator=0;}updateAnalogClock();if(steps>0)input.endFrame();
  }else{world.update(Math.min(delta,.033),state.raceTime,input);accumulator=0;}
  world.render();requestAnimationFrame(frame);
}

renderLoading();
world.init((progress)=>renderLoading(progress)).then(()=>{renderTitle();requestAnimationFrame(frame);}).catch((error)=>{console.error(error);renderLoading(0,true);});
