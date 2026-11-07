---
layout: project
title: PANSOPHIA — In-House CFD & Multiphysics Solver
description: A from-scratch Julia CFD/multiphysics library, with a Python frontend and a cross-engine geometry kernel, aimed at closing the gap between commercial CFD and machine learning
img: assets/img/projects/cfdcore/01_04_mms_convergence-800.png
importance: 5
category:
- cfd
source: intake
studio: atlas?ch=S34&ex=1
restored_from: main@5fe9141
icon: assets/img/projects/cfdcore/icon.webp
icon_video: assets/img/projects/cfdcore/icon.webm
icon_video_mp4: assets/img/projects/cfdcore/icon.mp4
recreate:
  video: assets/img/projects/cfdcore/recreate.webm
  poster: assets/img/projects/cfdcore/recreate.webp
  steps:
  - Open the controls panel
  - 'Pick example 2: FTCS heat at r = 0.55'
  - 'Press Play: the sawtooth grows'
  - Lower the stability number r to 0.4
  - 'Press Play again: the profile stays smooth'
  explainer: figure.cfdcore.scheme-stability-and-diffusion
  route: atlas?ch=S34&ex=1
---

*Πανσοφία — "all-encompassing wisdom": one solver, every physics.*

*Formerly developed and referred to internally as CFDCore.jl — the Julia module name is unchanged; **PANSOPHIA** is the project's public name going forward.*

## Problem

Most CFD codes in wide use today — commercial and open-source alike — carry architecture decisions from the 1980s and 2000s: a monolithic solver core that treats a machine-learning surrogate as, at best, an external post-processing step bolted on afterward, never as a first-class term inside the equations being solved. At the same time, commercial licences (Ansys, STAR-CCM+, COMSOL, CONVERGE) are an increasingly hard cost to justify for an individual researcher or a small group, which pushes real capability out of reach for exactly the people who'd benefit most from being able to look inside the solver and fix what's broken. That second problem is not hypothetical: the project's proximate trigger was a COMSOL-based inertial-microfluidics particle-separation workflow where the tool's own advertised feature (particle-tracing lift force) simply never registered with the solver, across six production channel geometries, with no way to look inside and repair it.

## Approach

PANSOPHIA is an attempt to draw the strongest available open-source components — meshing, linear algebra, automatic differentiation, SciML — together behind one coherent interface, rather than accepting either a commercial black box or a pile of disconnected open-source tools that don't talk to each other. The aim, stated plainly: match what COMSOL, STAR-CCM+, Ansys and CONVERGE can do, and go further where their architecture is the limiting factor — specifically, on native integration of neural/ML models as terms inside the governing equations, not as an afterthought. This is a long-term, actively developing effort, not a finished product, and it's described here in that spirit.

Concretely, it's a from-scratch CFD/multiphysics library in Julia (~40,000 lines across 290 source files, spanning finite-volume numerics, chemistry, combustion, multiphysics coupling, structural mechanics, stochastic/UQ methods and a SciML module), built with a Python frontend, two GUIs (a Qt desktop app and a Dash web app), and a cross-engine geometry kernel — Gmsh, a signed-distance-field kernel, and a PicoGK-compatible interface — so the same shape can be verified against three independent meshers rather than trusted on the word of one.

## Geometry kernel

A CFD solver is only as trustworthy as the geometry it meshes, and commercial CAD kernels are themselves black boxes. Alongside using Gmsh where it's the right tool, the project is building geometry-kernel capability from scratch: a signed-distance-field (SDF) representation and a PicoGK-compatible interface, developed specifically so every test shape can be cross-checked against an independent engine rather than trusted on a single implementation. The `geometry_test` suite below is the evidence for that: 15 shapes (box, cylinder, tube, torus, cone, wedge, pyramid, L-channel, boolean box-minus-cylinder, revolved nozzle, extruded L-profile, translated/rotated assembly, vessel-tube FSI geometry, and STL/STEP re-import round-trips) run through all three engines, with validity, watertightness and enclosed volume checked automatically.

## Implementation

- **Core:** Julia (Gridap for FEM assembly, Krylov/AlgebraicMultigrid for linear solves, Lux/Zygote for the SciML source-term module) — 191 source files.
- **Frontend:** Python (PyQt5, Dash), bridged to Julia via `juliacall`.
- **Geometry service:** a C#/.NET managed signed-distance-field REST service, mimicking the PicoGK API shape.
- OpenFOAM is used only as a **secondary** case-writing backend for one tutorial-derived reacting-jet case — the solver itself is original.

## Original contributions

The full finite-volume numerical stack (schemes, TVD limiters, nine time integrators); the reacting-flow arc (low-Mach compressible reacting Navier–Stokes with heat-release dilatation); the microfluidics solver and Maxey–Riley particle tracer; rocket/propulsion sizing modules; the stochastic/SDE turbulence-closure module; the from-scratch signed-distance-field and PicoGK-compatible geometry engines; and all three GUIs.

## Adopted packages

Built on, not reinvented: **Gmsh** and **Gridap**/**GridapGmsh** for meshing and FEM assembly machinery; **Krylov**, **LinearSolve** and **AlgebraicMultigrid** for linear algebra; **Lux**, **Zygote**, **Optimisers** and **ForwardDiff** for the differentiable/SciML source-term module; **KernelAbstractions** for GPU portability; **WriteVTK** for ParaView-compatible output; **FFTW** for spectral analysis. **OpenFOAM** is adopted only as a secondary case-writing backend, not as the solver. The physics interfaces, coupling terms and everything listed under Original contributions above are built on top of these libraries, not inside them.

Areas still forming, marked here rather than overstated: the ML-as-first-class-term integration that motivates the whole project is early-stage, as is the fully from-scratch geometry kernel (currently cross-checked against, not yet a full replacement for, Gmsh) — both **coming soon**, not yet delivered capability. Development has used Claude.ai as a coding aid throughout; final design and validation decisions are Krunal's.

## Validation

97 Julia test files, 2,794 passing tests at last full run, against named literature benchmarks: Ghia (1982, lid-driven cavity), Armaly (1983, backward-facing step), De Vahl Davis (1983, natural convection — measured Nu≈2.20–2.22 at Ra=10<sup>4</sup> vs. a reference 2.24), Incropera, and Cho & Kensey. A regenerative-cooling channel validation reaches 1.9% error against SSME-class literature hot-wall temperature.

Numerics are checked independently of any specific physics case: a method-of-manufactured-solutions study confirms discretization error shrinks at the theoretically predicted rate under mesh refinement (not just "looks right" on one grid); a von Neumann stability analysis gives the analytical amplification factor for each scheme/time-integrator pairing, cross-checked against the empirically measured stability regions and a CFL-number sweep.

The geometry kernel's own validation is cross-engine agreement, not just "did it run": all three independent geometry backends (Gmsh, SDF, PicoGK-compatible) report identical enclosed volume, validity and watertightness for the same test shapes — for example, the revolved-nozzle case, all three engines compute 5.4633×10<sup>-5</sup> m³, valid and watertight.

Two smaller physics studies from the pre-release planning archive round out the picture: a spherical-droplet extinction sweep reproduces the classic U-shaped extinction curve — kinetic extinction at small droplet diameter, radiative extinction at large diameter, with a stable burning window in between (d₀ ∈ [0.20, 3.0] mm in this sweep) — confirming both extinction branches are physically present, not just one. A 2D volume-of-fluid tank-slosh case measures the free-oscillation natural frequency at 5.3235 rad/s against an analytic 5.3156 rad/s (0.15% error), and confirms resonant forcing produces a larger steady-state amplitude than off-resonant forcing, as it must.

The documentation deliberately marks known gaps (no compressible density-based solver, no AMR, no radiation) rather than overstating maturity — that candor is itself part of the engineering discipline here.

## Microfluidics validation dossier

The particle-separation application that motivated the whole project gets its own standing validation dossier, not just a demo screenshot: the base 3D pipe-flow field checked to machine precision against the exact Hagen-Poiseuille profile, then a real 3D particle tracer built on that field reproducing the Segre-Silberberg (1962) tubular-pinch mechanism directly — four tracked particles genuinely migrating toward an intermediate equilibrium radius from both directions, not assumed. Curved-duct Dean secondary flow is checked quantitatively against both the low-De (Dean 1928) and high-De (Ookawara 2004) scaling laws, and a predicted four-vortex transition that this model's own probe does *not* reproduce is kept in as a disclosed, investigated miss rather than dropped.

The topology-optimization formulation gets the same treatment as the physics: a closed-form Brinkman-channel exact solution the penalization method actually solves (residual under 1e-6 relative, ForwardDiff-checked); the Brinkman-penalization approximation cross-checked directly against a genuinely body-fitted mesh of the same geometry, including a real, mesh-refinement-confirmed non-monotonic conditioning effect; a dissipated-power identity closing to FEM discretization error; and — the actual pre-optimization gate — the analytic design-sensitivity gradient overlaid exactly on a central-finite-difference estimate, since a wrong gradient here would silently break every downstream optimization result.

## Geometry creator (new: from-scratch feature-tree CAD)

Building on the cross-engine geometry-kernel work above, a newer sub-project pushes the from-scratch signed-distance-field kernel toward genuine CAD-style feature-tree modeling, dependency-free: revolve (a profile swept into a solid of revolution), fillet (smoothly blending two intersecting primitives, not a sharp boolean seam), shell (hollowing a solid to a specified wall thickness), and exact circular sweep (a disk swept into a torus geometrically, not by discretized approximation) are all implemented and verified by rendering each feature and checking it by eye against its expected geometric identity.

## My contribution

Developed by me from scratch, including the reacting-flow arc, the microfluidics solver, the geometry kernel work, the stochastic/UQ module, and all three GUIs, on top of the open-source libraries listed above.

## Where this is going

A physics solver where every constraint that mattered for the motivating problem is implemented and testable in-house — not a black box whose failure mode has no path to a fix — moving toward native integration of machine-learning terms inside the governing equations, and a fully independent geometry kernel, as the two areas under active development.
