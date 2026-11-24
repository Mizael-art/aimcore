# AIMCORE — Valorant Aim Lab

Aim trainer 3D de navegador focado em VALORANT: sensibilidade real do jogo, 7 modos, 10 cenários, Sensitivity Lab, estatísticas, rotina adaptativa e progressão. Three.js + TypeScript + Vite, sem backend (tudo em `localStorage`).

## Rodar

```bash
npm install
npm run dev      # desenvolvimento (http://localhost:5173)
npm test         # 40 testes (matemática, colisão, bots jogando todos os modos, Sensitivity Lab)
npm run build    # gera dist/index.html (arquivo único, abre direto no navegador)
```

Use Chrome ou Edge para entrada bruta (`unadjustedMovement`). Firefox funciona, mas sem garantia de raw input — use a calibração.

## Sensibilidade

- Rotação por count = `sens × 0,07°`, igual nos eixos horizontal e vertical. Nenhum multiplicador próprio.
- `eDPI = DPI × sens` · `cm/360 = 360 × 2,54 / (DPI × sens × 0,07)` (800 × 0,25 → 65,31 cm).
- Câmera movida só por `movementX/Y` (deltas relativos via Pointer Lock), aplicados a cada evento, não por frame.
- FOV: 103° horizontal em 16:9 (vertical 70,53°), Hor+ em outras proporções.
- ADS: sensibilidade escalada pela razão de tangentes do FOV do zoom × multiplicador configurável.
- **Calibração** (Configurações): mova o mouse X cm com uma régua; o fator corrige qualquer escala do navegador/SO.

## Arquitetura

```
src/core/      matemática pura: sensibilidade, geometria/colisão analítica, análise de flick, RNG com seed
src/modes/     lógica dos modos (sem DOM): flick, tracking, switching, reaction, humanoide + catálogo de cenários
src/game/      engine Three.js, input (Pointer Lock), alvos, armas, áudio sintetizado, arena
src/lab/       Sensitivity Lab: faixas de teste, análise composta, bootstrap, refinamento, veredictos
src/data/      tipos, persistência, estatísticas, progressão (XP/níveis/conquistas), rotina adaptativa
src/ui/        telas, gráficos em canvas, fluxo de sessão
tests/         bot que "move o mouse" em counts inteiros e joga cada modo
```

A lógica dos modos é independente da renderização, então os mesmos modos rodam no navegador e nos testes.

## Sensitivity Lab

1. Faixa inicial ao redor da sens atual (0,25 → 0,20 · 0,22 · 0,24 · 0,25 · 0,26 · 0,28 · 0,30), ajustada por estilo e experiência.
2. Cada sens joga Micro Flick, Wide Flick, Target Switching e Micro Adjustment com **a mesma seed, dificuldade e duração**; a ordem é embaralhada; modo cego opcional.
3. Pontuação composta (precisão, consistência, over/undershoot, erros, velocidade) com escalas absolutas e erro-padrão por bootstrap.
4. Refinamento ±2%/±6% ao redor da melhor, até a melhor estabilizar (máx. 3 baterias).
5. Resultado com faixa estável, veredictos (alta/baixa demais), justificativa e aviso de **inconclusivo** quando as diferenças estão dentro do ruído.

## Limitações honestas

- O navegador limita o polling efetivo (eventos agrupados); o FPS/Hz medido aparece no HUD.
- O tempo de reação inclui a latência do monitor e do sistema.
- Valores de arma (cadência, dano, spread) são aproximações originais, não dados oficiais.
