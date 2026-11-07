---
layout: project
title: PANSOPHIA geometry kernel
description: A from-scratch signed-distance-field geometry kernel cross-checked against Gmsh and a PicoGK-compatible engine, with the GeoStudio GUI
img: assets/img/projects/geometry-kernel/37_kernel_sdf_revolved_nozzle-800.png
importance: 21
category:
- geometry
- cfd
source: intake
studio: intersect?preset=0
studio_fallback: revolve?preset=0
subjects:
- geometry
tier: open-source
icon: assets/img/projects/geometry-kernel/icon.webp
icon_video: assets/img/projects/geometry-kernel/icon.webm
icon_video_mp4: assets/img/projects/geometry-kernel/icon.mp4
recreate:
  video: assets/img/projects/geometry-kernel/recreate.webm
  poster: assets/img/projects/geometry-kernel/recreate.webp
  steps:
  - Open the controls panel
  - Raise the number of slices n to 24
  - Press Revolve 0 to 360 degrees
  - Choose cylindrical shells
  - Press Unroll one slice
  explainer: figure.geometry-kernel.sdf-revolved-nozzle
  route: revolve?preset=0
---

## Datasheet

- Cross-engine test script: `scripts/test_geometry_pipeline.py`; catalogue in `geometry/test_geometries.md` (16 shapes; 14 run on PicoGK-compatible, 15 on Gmsh, 16 on SDF).
- `figures/geometry_test/report.txt`: 45 of 45 test entries report valid and watertight (box, cylinder, tube, L-channel, box minus cylinder, vessel tube, cone, torus, wedge, pyramid, extruded L-profile, revolved nozzle, translated/rotated assembly, STL re-import, plus STEP re-import on Gmsh; SDF sphere and smooth blend). Revolved nozzle volume 5.4633e-05 m3 on all three engines.
- Kernel code: `python/cfdpy/geometry` (sdf_kernel.py, backends.py, features.py, ffd.py, taper.py, ...); C#/.NET SDF service in `geometry_service` (Primitives.cs, MarchingCubes.cs, StlWriter.cs, Program.cs).
- GeoStudio op registry (`geopy.tree.OPS` in the S9 study): 38 ops; `scripts/verify_geostudio_gui.py` drives the real Qt GUI and screenshots one node per op (38 sandbox + 29 toolbar screenshots).
