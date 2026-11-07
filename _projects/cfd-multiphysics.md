---
layout: project
title: PANSOPHIA multiphysics test cases
description: Cavity, conjugate heat transfer, boiling, FSI, structural, ignition and stochastic/UQ test figures from the PANSOPHIA solver
img: assets/img/projects/cfd-multiphysics/18_rf_ignition_transient-800.webp
importance: 23
category:
- cfd
source: intake
studio: atlas?ch=S34&ex=1
subjects:
- cfd-numerics
- uq
tier: open-source
icon: assets/img/projects/cfd-multiphysics/icon.webp
icon_video: assets/img/projects/cfd-multiphysics/icon.webm
icon_video_mp4: assets/img/projects/cfd-multiphysics/icon.mp4
recreate:
  video: assets/img/projects/cfd-multiphysics/recreate.webm
  poster: assets/img/projects/cfd-multiphysics/recreate.webp
  steps:
  - Open the controls panel
  - 'Pick example 1: Central difference of sin x'
  - Press Play
  - Choose the forward difference
  - Press Play again
  explainer: figure.cfd-multiphysics.structured-mesh-and-smoke-tests
  route: atlas?ch=S30&ex=0
---

## Datasheet

- Source figures: `figures/test_output` (16), `figures/capstone` (2), `figures/stochastic` (10); generators `scripts/generate_test_figures.py`, `scripts/run_stochastic_educational.py`, `scripts/plot_ignition_transient_figure.py`.
- Code areas (Julia files): multiphysics 16, fsi 8, structural 14, stochastic 12, combustion 5, propulsion 8, chemistry 10.
- Stochastic module folders: sde, mixing, sgs, uq, velocity, particles.
- Julia test files in `CFDCore.jl/test`: 121 (`test_*.jl`).
