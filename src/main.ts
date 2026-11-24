import './ui/styles.css';
import { cmPer360, edpi } from './core/sensitivity';
import { levelInfo } from './data/progression';
import { store } from './data/store';
import { icon, esc } from './ui/dom';
import { renderDashboard } from './ui/screens/dashboard';
import { renderPlay } from './ui/screens/play';
import { renderLab } from './ui/screens/lab';
import { renderStats } from './ui/screens/stats';
import { renderRoutine } from './ui/screens/routine';
import { renderHistory } from './ui/screens/history';
import { renderSettings } from './ui/screens/settings';
import { getEngine } from './game/engine';

type Screen = (root: HTMLElement) => void | (() => void);

const ROUTES: { id: string; name: string; icon: string; render: Screen }[] = [
  { id: 'dashboard', name: 'Dashboard', icon: 'dash', render: renderDashboard },
  { id: 'play', name: 'Treinamentos', icon: 'play', render: renderPlay },
  { id: 'lab', name: 'Sensitivity Lab', icon: 'lab', render: renderLab },
  { id: 'stats', name: 'Estatísticas', icon: 'stats', render: renderStats },
  { id: 'routine', name: 'Rotina diária', icon: 'routine', render: renderRoutine },
  { id: 'history', name: 'Histórico', icon: 'history', render: renderHistory },
  { id: 'config', name: 'Configurações', icon: 'settings', render: renderSettings },
];

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="app">
    <aside class="side">
      <div class="brand"><div class="brand-mark"><i></i></div><div><b>AIMCORE</b><small>VALORANT AIM LAB</small></div></div>
      <nav class="nav">${ROUTES.map((r) => `<a href="#${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.name}</span></a>`).join('')}</nav>
      <div class="side-foot" id="side-foot"></div>
    </aside>
    <main class="main" id="main"></main>
  </div>`;

const main = document.getElementById('main')!;
let cleanup: void | (() => void);

function renderSide() {
  const s = store.settings;
  const li = levelInfo(store.profile.xp);
  document.getElementById('side-foot')!.innerHTML = `
    <div class="lvl"><span>NÍVEL</span><b>${li.level}</b></div>
    <div class="xpbar"><i style="width:${(li.pct * 100).toFixed(1)}%"></i></div>
    <div class="side-sens">SENS <b>${s.sens.toFixed(3)}</b> · DPI <b>${s.dpi}</b><br>eDPI <b>${Math.round(edpi(s.dpi, s.sens))}</b> · <b>${cmPer360(s.dpi, s.sens).toFixed(1)}</b> cm/360</div>
    ${store.memoryOnly ? '<div class="side-sens" style="color:var(--amber);margin-top:8px">⚠ armazenamento local indisponível</div>' : ''}
    <div class="side-sens dim" style="margin-top:8px">${esc(store.profile.name)}</div>`;
}

export function route() {
  if (getEngine().busy) return;
  const id = location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  const r = ROUTES.find((x) => x.id === id) ?? ROUTES[0];
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', (a as HTMLElement).dataset.route === r.id));
  if (typeof cleanup === 'function') cleanup();
  main.innerHTML = '';
  const page = document.createElement('div');
  page.className = 'page';
  main.appendChild(page);
  main.scrollTop = 0;
  cleanup = r.render(page);
  renderSide();
}

window.addEventListener('hashchange', route);
store.subscribe(renderSide);
getEngine().mount(document.body);
route();

// gancho de diagnóstico (usado pelos testes end-to-end)
(window as unknown as Record<string, unknown>).__AIMCORE__ = { engine: getEngine(), store };
