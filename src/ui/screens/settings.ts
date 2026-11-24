import { cmPer360, countsForCm, edpi, inPer360, roundSens, verticalFovFrom16x9 } from '../../core/sensitivity';
import { defaultSettings, store } from '../../data/store';
import type { CrosshairSettings, Settings } from '../../data/types';
import { parseValorantCode, renderCrosshair, toValorantCode } from '../../game/crosshair';
import { MouseInput } from '../../game/input';
import { esc, modal, onAct, toast } from '../dom';

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export function renderSettings(root: HTMLElement) {
  let calib: MouseInput | null = null;
  const num = (k: NumKey, label: string, o: { min?: number; max?: number; step?: number; help?: string } = {}) =>
    `<div class="field"><label>${label}</label><input type="number" data-k="${k}" value="${store.settings[k]}" min="${o.min ?? ''}" max="${o.max ?? ''}" step="${o.step ?? 'any'}">${o.help ? `<div class="help">${o.help}</div>` : ''}</div>`;
  const chk = (k: BoolKey, label: string, help = '') =>
    `<label class="check"><input type="checkbox" data-k="${k}" ${store.settings[k] ? 'checked' : ''}> <span>${label}${help ? `<br><span class="dim" style="font-size:12px">${help}</span>` : ''}</span></label>`;
  const x = store.settings.crosshair;
  const xnum = (k: keyof CrosshairSettings, label: string, min: number, max: number, step = 1) =>
    `<div class="field"><label>${label} <span class="mono dim" data-xv="${k}">${x[k]}</span></label><input type="range" data-x="${k}" min="${min}" max="${max}" step="${step}" value="${x[k]}"></div>`;
  const xchk = (k: keyof CrosshairSettings, label: string) => `<label class="check"><input type="checkbox" data-x="${k}" ${x[k] ? 'checked' : ''}> ${label}</label>`;

  root.innerHTML = `
    <div class="page-head"><div><div class="kicker">Sistema</div><h1>Configurações</h1></div></div>
    <div class="grid g3">
      <div class="card span2"><h2>Mouse · sensibilidade VALORANT</h2>
        <div class="grid g3">
          ${num('sens', 'Sensibilidade do VALORANT', { min: 0.001, max: 10, step: 0.001, help: 'Exatamente o valor do jogo. Rotação = sens × 0,07° por count.' })}
          ${num('dpi', 'DPI do mouse', { min: 50, max: 32000, step: 50 })}
          ${num('adsMultiplier', 'Multiplicador ADS / scope', { min: 0.01, max: 3, step: 0.01, help: 'Escalado pela razão de FOV do zoom (Vandal/Phantom 1,25×, Sheriff 1,15×).' })}
          ${num('pollingRate', 'Polling rate (Hz)', { min: 125, max: 8000, step: 125, help: 'Informativo — compare com a taxa medida abaixo.' })}
        </div>
        <div style="display:flex;gap:26px;flex-wrap:wrap;margin-top:18px">
          ${chk('invertY', 'Inverter eixo vertical')}
          ${chk('rawInput', 'Entrada bruta (raw)', 'Ignora aceleração/sensibilidade do Windows (Chrome/Edge)')}
          ${chk('lowLatencyInput', 'Entrada de baixa latência', 'Usa pointerrawupdate quando disponível')}
        </div></div>
      <div class="card accent" id="calc"></div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Calibração do navegador</h2><span class="muted" style="font-size:12px">fator atual <b class="mono" id="cal-cur">${store.settings.calibration.toFixed(4)}</b></span></div>
      <p class="muted" style="margin-top:0">Navegadores podem escalar o movimento do mouse (DPI do Windows, zoom, aceleração). Meça com uma régua: o AIMCORE compara os counts recebidos com os esperados para o seu DPI.</p>
      <div class="grid g3">
        <div class="field"><label>Distância que você vai mover (cm)</label><input type="number" id="cal-cm" value="10" min="2" max="60" step="0.5"></div>
        <div class="span2" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
          <button class="btn primary" data-act="cal-start">Capturar mouse</button>
          <button class="btn" data-act="cal-apply" disabled id="cal-apply">Aplicar fator</button>
          <button class="btn ghost" data-act="cal-reset">Resetar para 1,0</button></div>
      </div>
      <div id="cal-box" class="xh-preview" style="height:120px;margin-top:14px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;cursor:pointer" data-act="cal-start">
        <div class="mono" id="cal-read" style="font-size:15px">Clique em "Capturar mouse", alinhe o mouse no início da régua e mova horizontalmente.</div>
        <div class="dim" style="font-size:12px">ESC solta o mouse · ESPAÇO zera a contagem</div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Vídeo</h2>
        <div class="grid g2">
          ${num('hfov', 'FOV horizontal (16:9)', { min: 60, max: 130, step: 1, help: `VALORANT usa 103° fixo. Vertical: ${verticalFovFrom16x9(store.settings.hfov).toFixed(2)}°.` })}
          <div class="field"><label>Resolução de renderização</label><select data-k="renderScale">${[1, 0.85, 0.75, 0.6, 0.5].map((v) => `<option value="${v}" ${v === store.settings.renderScale ? 'selected' : ''}>${Math.round(v * 100)}% ${v === 1 ? '(nativa)' : ''}</option>`).join('')}</select><div class="help">Reduza se não atingir ${'≥'}144 FPS.</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
          <div class="field"><label>Mapa</label><select data-k="arena"><option value="range" ${store.settings.arena === 'range' ? 'selected' : ''}>Range — campo de treino claro (estilo tático)</option><option value="void" ${store.settings.arena === 'void' ? 'selected' : ''}>Void — sala escura, sem distrações</option></select></div>
          ${chk('shadows', 'Sombras (desligue se o FPS cair)')}
          ${chk('showWeapon', 'Mostrar arma em primeira pessoa')}
          ${chk('movementAlways', 'Permitir WASD em todos os cenários com arma', 'Por padrão só nos cenários marcados com WASD')}
          ${chk('antialias', 'Anti-aliasing (MSAA)')}
          ${chk('showFps', 'Mostrar FPS e taxa de eventos do mouse')}
          ${chk('fullscreenOnStart', 'Entrar em tela cheia ao iniciar um treino')}
          <div><button class="btn sm" data-act="fs">Alternar tela cheia agora</button></div>
        </div></div>
      <div class="card"><h2>Mira</h2>
        <div class="xh-preview" style="margin-bottom:16px"><div class="xh-wrap" style="left:50%;top:50%"><div id="xh-prev"></div></div></div>
        <div class="grid g2">
          <div class="field"><label>Cor</label><input type="color" data-x="color" value="${x.color}"></div>
          <div class="field"><label>Cor dos alvos</label><input type="color" data-k="targetColor" value="${store.settings.targetColor}"></div>
          ${xnum('innerLength', 'Comprimento', 0, 20)} ${xnum('innerThickness', 'Espessura', 1, 10)}
          ${xnum('innerGap', 'Distância do centro', 0, 20)} ${xnum('innerOpacity', 'Opacidade', 0.1, 1, 0.05)}
          ${xnum('dotSize', 'Ponto central', 1, 8)} ${xnum('outlineOpacity', 'Opacidade do contorno', 0, 1, 0.05)}
        </div>
        <h3 style="margin-top:16px">Linhas externas</h3>
        <div class="grid g2">${xnum('outerLength', 'Comprimento', 0, 20)} ${xnum('outerThickness', 'Espessura', 1, 10)} ${xnum('outerGap', 'Distância do centro', 0, 40)} ${xnum('outerOpacity', 'Opacidade', 0.05, 1, 0.05)}</div>
        <div style="display:flex;gap:22px;margin-top:14px;flex-wrap:wrap">${xchk('showInner', 'Linhas internas')} ${xchk('showOuter', 'Linhas externas')} ${xchk('centerDot', 'Ponto central')} ${xchk('outline', 'Contorno')} ${xchk('firingError', 'Erro de disparo/movimento')}</div>
        <div class="field" style="margin-top:16px"><label>Código de mira do VALORANT</label>
          <div style="display:flex;gap:8px"><input type="text" id="xh-code" placeholder="0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0" value=""><button class="btn" data-act="xh-import">Importar</button><button class="btn ghost" data-act="xh-export">Copiar código</button></div>
          <div class="help">Cole o código exportado no VALORANT (Configurações → Mira → Importar/Exportar). Usa o perfil principal.</div></div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Áudio e perfil</h2>
        <div class="field"><label>Volume <span class="mono dim" id="vol-v">${Math.round(store.settings.volume * 100)}%</span></label><input type="range" data-k="volume" min="0" max="1" step="0.05" value="${store.settings.volume}"></div>
        <div class="field" style="margin-top:14px"><label>Nome do jogador</label><input type="text" id="p-name" value="${esc(store.profile.name)}" maxlength="24"></div></div>
      <div class="card"><h2>Dados locais</h2>
        <p class="muted" style="margin-top:0">Tudo fica salvo no armazenamento local deste navegador. Exporte (ou copie, se o download estiver bloqueado) para fazer backup ou levar para outro PC.</p>
        <div class="row-btns" style="justify-content:flex-start"><button class="btn" data-act="export">Exportar JSON</button><button class="btn" data-act="copy">Copiar JSON</button><label class="btn">Importar JSON<input type="file" id="imp" accept=".json,application/json" hidden></label>
        <button class="btn ghost" data-act="reset-settings">Restaurar configurações</button><button class="btn ghost" data-act="wipe">Apagar tudo</button></div></div>
    </div>`;

  const calc = () => {
    const s = store.settings;
    const cm = cmPer360(s.dpi, s.sens);
    (root.querySelector('#calc') as HTMLElement).innerHTML = `<h2>Cálculo</h2>
      <div class="grid g2"><div class="stat"><div class="v">${Math.round(edpi(s.dpi, s.sens))}</div><div class="l">eDPI</div></div>
      <div class="stat"><div class="v">${cm.toFixed(2)}<small>cm</small></div><div class="l">cm/360</div></div>
      <div class="stat"><div class="v">${inPer360(s.dpi, s.sens).toFixed(2)}<small>in</small></div><div class="l">in/360</div></div>
      <div class="stat"><div class="v">${(s.sens * 0.07).toFixed(4)}<small>°</small></div><div class="l">graus por count</div></div></div>
      <p class="muted mono" style="font-size:11.5px;margin:14px 0 0">cm/360 = 360 × 2,54 / (${s.dpi} × ${s.sens} × 0,07)</p>`;
    renderCrosshair(root.querySelector('#xh-prev') as HTMLElement, s.crosshair);
  };
  calc();

  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) =>
    el.addEventListener('input', () => {
      const k = el.dataset.k as keyof Settings;
      const cur = store.settings[k];
      let v: unknown;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') v = el.checked;
      else if (typeof cur === 'number') {
        v = Number(el.value);
        if (!Number.isFinite(v as number) || (v as number) <= 0) {
          if (k !== 'volume') return;
          v = Math.max(0, Number(el.value) || 0);
        }
        if (k === 'sens') v = roundSens(v as number);
      } else v = el.value;
      store.updateSettings({ [k]: v } as Partial<Settings>);
      if (k === 'volume') (root.querySelector('#vol-v') as HTMLElement).textContent = `${Math.round((v as number) * 100)}%`;
      calc();
    }),
  );
  root.querySelectorAll<HTMLInputElement>('[data-x]').forEach((el) =>
    el.addEventListener('input', () => {
      const k = el.dataset.x as keyof CrosshairSettings;
      const v = el.type === 'checkbox' ? el.checked : el.type === 'color' ? el.value : Number(el.value);
      store.updateSettings({ crosshair: { ...store.settings.crosshair, [k]: v } });
      const lab = root.querySelector(`[data-xv="${k}"]`);
      if (lab) lab.textContent = String(v);
      calc();
    }),
  );
  root.querySelector('#p-name')!.addEventListener('change', (e) => {
    store.profile.name = (e.target as HTMLInputElement).value.trim() || 'Jogador';
    store.save();
  });
  root.querySelector('#imp')!.addEventListener('change', async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      store.importJson(await f.text());
      toast('Importado', 'Dados restaurados.');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      toast('Erro', String((err as Error).message));
    }
  });

  // ---------- calibração ----------
  let counts = 0;
  let countsY = 0;
  let maxRate = 0;
  const box = root.querySelector('#cal-box') as HTMLElement;
  const read = root.querySelector('#cal-read') as HTMLElement;
  const expected = () => countsForCm(store.settings.dpi, Number((root.querySelector('#cal-cm') as HTMLInputElement).value) || 10);
  const showRead = () => {
    const f = counts ? expected() / counts : 0;
    read.innerHTML = `X: <b>${counts}</b> unidades · Y: ${countsY} · esperado ${Math.round(expected())} para ${store.settings.dpi} DPI · fator ${f ? f.toFixed(4) : '—'} · eventos ${Math.round(calib?.eventRate ?? 0)} Hz (pico ${Math.round(maxRate)})${calib?.rawActive ? ' · RAW' : ''}`;
    (root.querySelector('#cal-apply') as HTMLButtonElement).disabled = counts < 50;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space' && calib?.locked) {
      e.preventDefault();
      counts = countsY = 0;
      showRead();
    }
  };
  document.addEventListener('keydown', onKey);
  const startCal = async () => {
    calib?.dispose();
    counts = countsY = maxRate = 0;
    calib = new MouseInput(box, {
      onMove: (dx, dy) => {
        counts += Math.abs(dx);
        countsY += Math.abs(dy);
        maxRate = Math.max(maxRate, calib!.eventRate);
        showRead();
      },
      onDown() {},
      onUp() {},
      onLockChange: (l) => {
        box.style.borderColor = l ? 'var(--red)' : '';
        if (!l) showRead();
      },
    }, { raw: store.settings.rawInput, lowLatency: store.settings.lowLatencyInput });
    const ok = await calib.lock();
    if (!ok) read.textContent = 'Não foi possível capturar o mouse: ' + calib.lastLockError;
    else showRead();
  };

  const offAct = onAct(root, {
    'cal-start': () => {
      if (!calib?.locked) void startCal();
    },
    'cal-apply': () => {
      if (counts < 50) return;
      const f = expected() / counts;
      store.updateSettings({ calibration: Math.round(f * 10000) / 10000 });
      (root.querySelector('#cal-cur') as HTMLElement).textContent = store.settings.calibration.toFixed(4);
      toast('Calibração aplicada', `Fator ${store.settings.calibration.toFixed(4)}. Repita 2–3 vezes para confirmar.`);
    },
    'xh-import': () => {
      const code = (root.querySelector('#xh-code') as HTMLInputElement).value;
      try {
        store.updateSettings({ crosshair: parseValorantCode(code, store.settings.crosshair) });
        toast('Mira importada', 'Código do VALORANT aplicado.');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (e) {
        toast('Código inválido', String((e as Error).message));
      }
    },
    'xh-export': () => {
      const code = toValorantCode(store.settings.crosshair);
      (root.querySelector('#xh-code') as HTMLInputElement).value = code;
      navigator.clipboard?.writeText(code).then(() => toast('Copiado', code), () => toast('Código', code));
    },
    'cal-reset': () => {
      store.updateSettings({ calibration: 1 });
      (root.querySelector('#cal-cur') as HTMLElement).textContent = '1.0000';
    },
    fs: () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => toast('Tela cheia', 'O navegador recusou a tela cheia.'))),
    export: () => {
      const blob = new Blob([store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aimcore-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    copy: () =>
      navigator.clipboard.writeText(store.exportJson()).then(
        () => toast('Copiado', 'Backup em JSON copiado para a área de transferência.'),
        () => toast('Erro', 'O navegador recusou o acesso à área de transferência.'),
      ),
    'reset-settings': () => {
      store.data.settings = defaultSettings();
      store.save();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    wipe: () =>
      modal('<h2>Apagar todos os dados?</h2><p class="muted">Histórico, perfil, conquistas e resultados do Lab serão removidos deste navegador.</p><div class="row-btns" style="justify-content:flex-end"><button class="btn ghost" data-act="no">Cancelar</button><button class="btn primary" data-act="yes">Apagar</button></div>', (a, _e, close) => {
        close();
        if (a === 'yes') {
          store.reset();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }),
  });

  return () => {
    offAct();
    calib?.dispose();
    document.removeEventListener('keydown', onKey);
  };
}
