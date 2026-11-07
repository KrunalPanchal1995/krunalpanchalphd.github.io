---
layout: project
title: PANSOPHIA numerics teaching figures
description: Fifteen teaching figures on schemes, stability and accuracy, generated from the PANSOPHIA numerics stack
img: assets/img/projects/cfd-numerics-teaching/03_stability_regions-800.png
importance: 20
category:
- cfd
source: intake
studio: atlas?ch=S34&ex=1
subjects:
- cfd-numerics
tier: open-source
icon: assets/img/projects/cfd-numerics-teaching/icon.webp
icon_video: assets/img/projects/cfd-numerics-teaching/icon.webm
icon_video_mp4: assets/img/projects/cfd-numerics-teaching/icon.mp4
recreate:
  video: assets/img/projects/cfd-numerics-teaching/recreate.webm
  poster: assets/img/projects/cfd-numerics-teaching/recreate.webp
  steps:
  - Open the controls panel
  - 'Pick example 2: Implicit Euler is unconditionally stable'
  - Raise the step h to 1.5
  - Switch the method to explicit Euler
  - Switch back to the implicit method
  explainer: figure.cfd-numerics-teaching.neumann
  route: atlas?ch=S32&ex=1
---

## Datasheet

- Source: `scripts/run_phase1_educational.py` writes 15 figures to `figures/edu/` (1849-2984 px wide).
- Topics covered by the script: scheme comparison, von Neumann stability, stability regions, MMS convergence, CFL sweep, residual history, mesh zones, numerical diffusion, dispersion/dissipation, phase error, solution snapshots, Burgers shock formation, modified wavenumber, space-time heatmaps.
- Convection schemes in `CFDCore.jl/src/schemes/convection`: UDS, CDS, LUDS, QUICK, TVD, VOF advection. Diffusion: central difference.
- Time integrators in `CFDCore.jl/src/time`: Forward Euler, Backward Euler, Crank-Nicolson, RK2, RK4, AB2, BDF2, IMEX, Strang splitting.
