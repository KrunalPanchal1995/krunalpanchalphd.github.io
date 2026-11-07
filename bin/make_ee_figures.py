"""Generate the figures for the electrical / electronics / photonics learning projects.

Every curve is computed from a standard textbook formula (quoted in each project page); parameters that are
illustrative rather than measured are labelled "illustrative" on the figure. Writes, for each figure,
assets/img/projects/<slug>/NN_name-800.png and NN_name-1600.png.

    python bin/make_ee_figures.py            # all figures
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "projects"
INK, ACCENT, ACCENT2, ACCENT3, GRID = "#1f2933", "#0e7c86", "#c2410c", "#4f46e5", "#d5dbe1"

plt.rcParams.update(
    {
        "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white",
        "axes.edgecolor": INK, "axes.labelcolor": INK, "xtick.color": INK, "ytick.color": INK, "text.color": INK,
        "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.6, "axes.spines.top": False, "axes.spines.right": False,
        "font.size": 10, "axes.titlesize": 11, "legend.frameon": False, "lines.linewidth": 2.0,
    }
)
FIGS = []  # (slug, filename stem, caption, topic)


def new(title):
    fig, ax = plt.subplots(figsize=(8, 4.8))
    ax.set_title(title, loc="left", fontweight="bold")
    return fig, ax


def save(fig, slug, num, name, caption, topic):
    d = OUT / slug
    d.mkdir(parents=True, exist_ok=True)
    stem = f"{num:02d}_{name}"
    fig.tight_layout()
    fig.savefig(d / f"{stem}-800.png", dpi=100)
    fig.savefig(d / f"{stem}-1600.png", dpi=200)
    plt.close(fig)
    FIGS.append((slug, stem, caption, topic))


# ---------------------------------------------------------------- silicon photonics
def ring_resonator():
    n_eff, n_g, L, lam0 = 2.4, 4.2, 2 * np.pi * 10e-6, 1550e-9  # 10 um radius ring
    dn = (n_eff - n_g) / lam0  # n_g = n_eff - lam dn/dlam

    def trans(lam, r, a):
        phi = 2 * np.pi * (n_eff + dn * (lam - lam0)) * L / lam
        return (a**2 - 2 * a * r * np.cos(phi) + r**2) / (1 - 2 * a * r * np.cos(phi) + (a * r) ** 2)

    coarse = np.linspace(1548e-9, 1558e-9, 200001)
    lam_res = coarse[np.argmin(trans(coarse, 0.99, 0.99))]  # resonance nearest the middle of the band
    lam = np.linspace(lam_res - 0.5e-9, lam_res + 0.5e-9, 4000)
    fig, ax = new("Ring resonator through-port, zoomed on one resonance")
    for r, a, c, lab in [(0.95, 0.99, ACCENT2, "r = 0.95 < a: over-coupled (shallow)"), (0.99, 0.99, ACCENT, "r = a = 0.99: critical coupling (full extinction)"),
                         (0.995, 0.99, ACCENT3, "r = 0.995 > a: under-coupled (shallow)")]:
        T = trans(lam, r, a)
        ax.plot((lam - lam_res) * 1e12, 10 * np.log10(np.clip(T, 1e-4, None)), color=c, label=lab)
    fsr = lam0**2 / (n_g * L) * 1e9
    ax.set_xlabel("detuning from resonance (pm)"), ax.set_ylabel("through-port transmission (dB)"), ax.set_ylim(-42, 2)
    ax.legend(loc="lower right", fontsize=8)
    ax.text(0.01, 0.04, f"illustrative: n_eff = 2.4, n_g = 4.2, R = 10 um\nresonances repeat every FSR = lambda^2/(n_g L) = {fsr:.1f} nm", transform=ax.transAxes, fontsize=8)
    save(fig, "silicon-photonics-waveguides", 1, "ring_resonator_transmission",
         "Through-port dip of an all-pass ring: the depth depends on how the coupling r compares with the round-trip loss a; resonances repeat every FSR.", "rings")


def slab_modes():
    V = np.linspace(0.05, 10, 2000)
    fig, ax = new("Symmetric slab waveguide: normalised propagation constant b(V)")
    for m, c in zip(range(4), [ACCENT, ACCENT2, ACCENT3, "#7c3aed"]):
        b = np.full_like(V, np.nan)
        for i, v in enumerate(V):
            if v <= m * np.pi:
                continue
            lo, hi = 1e-9, 1 - 1e-9
            f = lambda bb: v * np.sqrt(1 - bb) - m * np.pi - 2 * np.arctan(np.sqrt(bb / (1 - bb)))
            for _ in range(60):  # bisection; f(lo) > 0 > f(hi) above cutoff
                mid = 0.5 * (lo + hi)
                lo, hi = (mid, hi) if f(mid) > 0 else (lo, mid)
            b[i] = 0.5 * (lo + hi)
        ax.plot(V, b, color=c, label=f"mode m = {m}")
    ax.set_xlabel("normalised frequency V = (2 pi d / lambda) sqrt(n1^2 - n2^2)"), ax.set_ylabel("b = (n_eff^2 - n2^2)/(n1^2 - n2^2)")
    ax.set_ylim(0, 1.02), ax.legend(loc="lower right")
    ax.text(0.01, 0.9, "cutoff of mode m at V = m pi\n(single-mode for V < pi)", transform=ax.transAxes, fontsize=9)
    save(fig, "silicon-photonics-waveguides", 2, "slab_waveguide_modes",
         "TE modes of a symmetric slab: mode m exists only above its cutoff V = m pi, so V < pi gives a single-mode guide.", "waveguides")


# ---------------------------------------------------------------- lasers / detectors
def responsivity():
    lam = np.linspace(0.4, 2.0, 1600)
    ideal = lam / 1.2398
    fig, ax = new("Photodiode responsivity R = eta q lambda / (h c)")
    ax.plot(lam, ideal, color=GRID, lw=2.5, label="ideal, eta = 1 (no cutoff)")
    # Same illustrative eta, so the curves coincide: draw them as nested widths (Ge widest, Si thinnest).
    for (name, Eg, c), lw in zip([("Ge (Eg ~ 0.66 eV)", 0.66, ACCENT3), ("InGaAs (Eg ~ 0.75 eV)", 0.75, ACCENT2), ("Si (Eg ~ 1.12 eV)", 1.12, ACCENT)], [6, 4, 2]):
        lc = 1.2398 / Eg
        R = np.where(lam <= lc, 0.8 * lam / 1.2398, np.nan)  # illustrative eta = 0.8, idealised hard cutoff
        ax.plot(lam, R, color=c, lw=lw, label=f"{name}, cutoff ~{lc:.2f} um")
        ax.plot([lc, lc], [0, 0.8 * lc / 1.2398], color=c, lw=1.2, ls=":")
    ax.set_xlabel("wavelength (um)" + chr(10) + "cutoff = 1.2398 / Eg[eV] um; beyond it a photon cannot cross the gap (real devices roll off gradually)", fontsize=9)
    ax.set_ylabel("responsivity (A/W)"), ax.legend(loc="upper left", fontsize=9), ax.set_ylim(0, 1.7)
    save(fig, "lasers-photodetectors", 1, "photodiode_responsivity",
         "Responsivity rises with wavelength (more photons per watt) until the band gap sets a hard long-wavelength cutoff; illustrative eta = 0.8.", "detectors")


def laser_li():
    I = np.linspace(0, 40, 400)
    Ith, eta_d_E = 10.0, 0.30  # illustrative: threshold 10 mA, slope 0.3 W/A
    P = np.where(I > Ith, eta_d_E * (I - Ith), 0)  # mW when I in mA and slope in mW/mA
    fig, ax = new("Laser diode light-current (L-I) characteristic")
    ax.plot(I, P, color=ACCENT, label="above threshold: P = slope x (I - I_th)")
    ax.plot(I[I <= Ith], 0.02 * I[I <= Ith], color=ACCENT2, ls="--", label="below threshold: weak spontaneous emission (LED-like)")
    ax.axvline(Ith, color=GRID, ls=":"), ax.set_ylim(0, 10)
    ax.set_xlabel("drive current (mA)"), ax.set_ylabel("optical output power (mW)"), ax.legend(loc="upper left")
    ax.text(0.99, 0.05, "illustrative: I_th = 10 mA, slope efficiency 0.3 mW/mA", transform=ax.transAxes, ha="right", fontsize=9)
    save(fig, "lasers-photodetectors", 2, "laser_li_curve",
         "Below threshold the diode is a weak LED; above I_th stimulated emission dominates and power rises linearly with current.", "lasers")


# ---------------------------------------------------------------- electromagnetics
def fresnel():
    th = np.radians(np.linspace(0, 89.9, 800))
    n1, n2 = 1.0, 1.5
    st = n1 * np.sin(th) / n2
    ct = np.sqrt(1 - st**2)
    rs = (n1 * np.cos(th) - n2 * ct) / (n1 * np.cos(th) + n2 * ct)
    rp = (n2 * np.cos(th) - n1 * ct) / (n2 * np.cos(th) + n1 * ct)
    fig, ax = new("Reflectance at an air-glass interface (n1 = 1, n2 = 1.5)")
    ax.plot(np.degrees(th), rs**2, color=ACCENT, label="s-polarised (TE)")
    ax.plot(np.degrees(th), rp**2, color=ACCENT2, label="p-polarised (TM)")
    thB = np.degrees(np.arctan(n2 / n1))
    ax.axvline(thB, color=GRID, ls="--"), ax.text(thB + 1, 0.5, f"Brewster angle\natan(n2/n1) = {thB:.1f} deg", fontsize=9)
    ax.set_xlabel("angle of incidence (degrees)"), ax.set_ylabel("power reflectance R"), ax.legend(loc="upper left")
    save(fig, "electromagnetics-maxwell", 1, "fresnel_reflectance",
         "Fresnel equations from Maxwell's boundary conditions: p-polarised light is not reflected at the Brewster angle.", "waves")


def skin_depth():
    f = np.logspace(3, 11, 400)
    mu0 = 4e-7 * np.pi
    fig, ax = new("Skin depth in metals: delta = sqrt(2 / (omega mu sigma))")
    for name, sig, c in [("copper (5.8e7 S/m)", 5.8e7, ACCENT), ("aluminium (3.5e7 S/m)", 3.5e7, ACCENT2)]:
        ax.loglog(f, np.sqrt(2 / (2 * np.pi * f * mu0 * sig)) * 1e6, color=c, label=name)
    ax.set_xlabel("frequency (Hz)"), ax.set_ylabel("skin depth (um)"), ax.legend()
    ax.text(0.02, 0.05, "at 1 GHz copper: ~2.1 um; current lives in a thin surface layer", transform=ax.transAxes, fontsize=9)
    save(fig, "electromagnetics-maxwell", 2, "skin_depth",
         "At high frequency the field decays inside a conductor over the skin depth, so only a thin surface layer carries current.", "conductors")


# ---------------------------------------------------------------- IC fabrication
def deal_grove():
    t = np.linspace(0, 10, 400)
    fig, ax = new("Thermal oxide growth at 1000 C (Deal-Grove model)")
    for name, A, B, tau, c in [("wet O2: A = 0.226 um, B = 0.287 um^2/h", 0.226, 0.287, 0.0, ACCENT2), ("dry O2: A = 0.165 um, B = 0.0117 um^2/h, tau = 0.37 h", 0.165, 0.0117, 0.37, ACCENT)]:
        x = (A / 2) * (np.sqrt(1 + 4 * B * (t + tau) / A**2) - 1)
        ax.plot(t, x * 1000, color=c, label=name)
    ax.set_xlabel("oxidation time (h)"), ax.set_ylabel("oxide thickness (nm)"), ax.legend(loc="upper left")
    ax.text(0.99, 0.05, "x^2 + A x = B (t + tau); typical textbook constants, approximate", transform=ax.transAxes, ha="right", fontsize=8)
    save(fig, "ic-fabrication-flow", 1, "oxide_growth_deal_grove",
         "Deal-Grove: growth is linear at first (reaction-limited) and slows to parabolic (diffusion-limited) as the oxide thickens.", "oxidation")


def yield_models():
    A = np.linspace(0.01, 6, 400)  # die area, cm^2
    fig, ax = new("Die yield versus die area for several defect densities")
    for D, c in [(0.1, ACCENT), (0.5, ACCENT2), (1.0, ACCENT3)]:
        ax.plot(A, np.exp(-A * D), color=c, label=f"Poisson, D = {D} /cm^2")
        ax.plot(A, ((1 - np.exp(-A * D)) / (A * D)) ** 2, color=c, ls="--")
    ax.plot([], [], color=INK, ls="--", label="dashed = Murphy model")
    ax.set_xlabel("die area A (cm^2)"), ax.set_ylabel("yield Y"), ax.set_ylim(0, 1.02), ax.legend(loc="upper right")
    ax.text(0.01, 0.05, "Poisson: Y = exp(-A D);  Murphy: Y = ((1 - exp(-A D)) / (A D))^2", transform=ax.transAxes, fontsize=9)
    save(fig, "ic-fabrication-flow", 2, "yield_vs_die_area",
         "Why big dies are expensive: with random defects, yield falls exponentially with die area, so smaller chiplets help.", "yield")


# ---------------------------------------------------------------- lithography
def rayleigh():
    NA = np.linspace(0.2, 1.4, 300)
    k1 = 0.3
    fig, ax = new("Rayleigh resolution R = k1 lambda / NA   (k1 = 0.3)")
    for lam, name, c in [(193, "193 nm ArF", ACCENT), (13.5, "13.5 nm EUV", ACCENT2)]:
        ax.plot(NA, k1 * lam / NA, color=c, label=name)
    for NA0, lam, lab in [(1.35, 193, "193i, NA 1.35"), (0.33, 13.5, "EUV, NA 0.33"), (0.55, 13.5, "High-NA EUV, NA 0.55")]:
        r = k1 * lam / NA0
        ax.plot([NA0], [r], "o", color=INK), ax.annotate(f"{lab}: {r:.0f} nm", (NA0, r), textcoords="offset points", xytext=(8, 8), fontsize=8)
    ax.set_yscale("log"), ax.set_xlabel("numerical aperture NA"), ax.set_ylabel("minimum half-pitch (nm)"), ax.legend(loc="upper right")
    save(fig, "lithography-euv-limits", 1, "rayleigh_resolution",
         "Resolution improves with shorter wavelength and larger NA; the dots mark typical tool settings (idealised, single exposure).", "resolution")


def photon_budget():
    dose = 30e-3  # J/cm^2, assumed
    px_nm2 = 10 * 10
    labels, N = [], []
    for name, lam_nm in [("193 nm DUV", 193.0), ("13.5 nm EUV", 13.5)]:
        E = 6.62607e-34 * 2.99792e8 / (lam_nm * 1e-9)
        n = dose / 1e14 / E * px_nm2  # photons incident on a 10x10 nm pixel
        labels.append(name), N.append(n)
    fig, ax = new("Photons per 10 nm x 10 nm pixel at the same dose")
    bars = ax.bar(labels, N, color=[ACCENT, ACCENT2], width=0.5)
    ax.set_yscale("log"), ax.set_ylabel("incident photons")
    for b, n in zip(bars, N):
        ax.text(b.get_x() + b.get_width() / 2, n * 1.25, f"{n:,.0f}\nshot noise 1/sqrt(N) = {100 / np.sqrt(n):.1f}%", ha="center", fontsize=9)
    ax.set_ylim(100, 2e5)
    ax.text(0.5, 0.04, "assumed dose 30 mJ/cm^2 (illustrative); photon energy E = h c / lambda", transform=ax.transAxes, ha="center", fontsize=8)
    save(fig, "lithography-euv-limits", 2, "photon_shot_noise",
         "EUV photons carry ~14x more energy, so the same dose delivers far fewer photons per pixel, which makes edges noisier (stochastics).", "stochastics")


# ---------------------------------------------------------------- MOSFET
def mosfet_iv():
    Vds = np.linspace(0, 1.5, 400)
    Vt, kp = 0.5, 2.0  # illustrative: k' W/L = 2 mA/V^2
    fig, ax = new("Idealised long-channel MOSFET output characteristics")
    for Vgs, c in zip([0.8, 1.0, 1.2, 1.4], [ACCENT, ACCENT3, ACCENT2, INK]):
        Vov = Vgs - Vt
        Id = np.where(Vds < Vov, kp * (Vov * Vds - Vds**2 / 2), 0.5 * kp * Vov**2)
        ax.plot(Vds, Id, color=c, label=f"V_GS = {Vgs} V")
    ax.plot(Vds, 0.5 * kp * Vds**2, color=INK, ls=":", lw=1.2, label="V_DS = V_GS - V_T (edge of saturation)")
    ax.set_xlabel("V_DS (V)"), ax.set_ylabel("I_D (mA)"), ax.legend(loc="upper left", fontsize=8)
    ax.text(0.99, 0.05, "illustrative: V_T = 0.5 V, k' W/L = 2 mA/V^2", transform=ax.transAxes, ha="right", fontsize=9)
    save(fig, "mosfet-cmos-scaling", 1, "mosfet_output_characteristics",
         "Square-law model: a resistor-like triode region below V_GS - V_T, then a flat saturation current.", "device")


def subthreshold():
    Vgs = np.linspace(0, 0.8, 400)
    kT_q = 0.02585  # 300 K
    fig, ax = new("Subthreshold conduction: swing S = n (kT/q) ln 10")
    for n, c in [(1.0, ACCENT), (1.5, ACCENT2)]:
        S = n * kT_q * np.log(10) * 1000
        Id = 1e-7 * np.exp((Vgs - 0.4) / (n * kT_q))
        ax.semilogy(Vgs, Id, color=c, label=f"n = {n}: S = {S:.0f} mV/decade")
    ax.set_ylim(1e-12, 1e-3), ax.set_xlabel("V_GS (V)"), ax.set_ylabel("I_D (A, arbitrary scale)"), ax.legend(loc="lower right")
    ax.text(0.02, 0.9, "At 300 K the ideal limit is ~60 mV per decade:\nlowering V_T raises off-state leakage exponentially.", transform=ax.transAxes, fontsize=9)
    save(fig, "mosfet-cmos-scaling", 2, "subthreshold_swing",
         "Below threshold the current is exponential in V_GS; the thermal voltage kT/q fixes a ~60 mV/decade floor at room temperature.", "leakage")


# ---------------------------------------------------------------- VLSI / circuits
def inverter_vtc():
    Vdd, Vt = 1.0, 0.3
    Vin = np.linspace(0, Vdd, 500)

    def idn(vgs, vds):
        vov = vgs - Vt
        return np.where(vov <= 0, 0, np.where(vds < vov, vov * vds - vds**2 / 2, 0.5 * vov**2))

    Vout = np.zeros_like(Vin)
    for i, vi in enumerate(Vin):
        lo, hi = 0.0, Vdd
        for _ in range(60):
            mid = 0.5 * (lo + hi)
            n = idn(vi, mid)
            p = idn(Vdd - vi, Vdd - mid)  # symmetric PMOS (kp = kn)
            lo, hi = (mid, hi) if n < p else (lo, mid)
        Vout[i] = 0.5 * (lo + hi)
    fig, ax = new("CMOS inverter voltage-transfer curve (idealised)")
    ax.plot(Vin, Vout, color=ACCENT, label="V_out")
    ax.plot([0, Vdd], [0, Vdd], color=GRID, ls="--", label="V_out = V_in")
    ax.set_xlabel("V_in (V)"), ax.set_ylabel("V_out (V)"), ax.legend(loc="upper right")
    ax.text(0.02, 0.05, "illustrative: V_DD = 1.0 V, |V_T| = 0.3 V, matched NMOS/PMOS (square law)\nswitching threshold at V_DD/2; a sharp edge gives noise margin", transform=ax.transAxes, fontsize=8)
    save(fig, "vlsi-circuit-design", 1, "cmos_inverter_vtc",
         "A CMOS inverter flips sharply near V_DD/2, restoring logic levels, and draws current only while switching.", "digital")


def power_delay():
    V = np.linspace(0.45, 1.2, 300)
    Vt, alpha = 0.3, 1.3
    E = V**2
    delay = V / (V - Vt) ** alpha
    fig, ax = new("Supply-voltage trade-off: energy versus delay")
    ax.plot(V, E / E[-1], color=ACCENT2, label="switching energy per operation ~ C V^2")
    ax.plot(V, delay / delay[-1], color=ACCENT, label="gate delay ~ V / (V - V_T)^alpha")
    ax.set_xlabel("supply voltage V_DD (V)"), ax.set_ylabel("normalised to V_DD = 1.2 V"), ax.legend(loc="upper center", fontsize=9)
    ax.text(0.99, 0.08, "illustrative: V_T = 0.3 V, alpha = 1.3 (alpha-power law)", transform=ax.transAxes, ha="right", fontsize=8)
    save(fig, "vlsi-circuit-design", 2, "energy_delay_tradeoff",
         "Lowering the supply voltage cuts energy quadratically but slows the gates, which is the core dynamic-voltage-scaling trade-off.", "power")


# ---------------------------------------------------------------- power electronics
def buck_waveform():
    Vin, D, L, fs, Iout = 12.0, 0.5, 22e-6, 100e3, 2.0
    T = 1 / fs
    Vout = D * Vin
    dI = (Vin - Vout) * D * T / L
    t = np.linspace(0, 3 * T, 3000)
    ph = (t % T) / T
    iL = np.where(ph < D, Iout - dI / 2 + (Vin - Vout) / L * ph * T, Iout + dI / 2 - Vout / L * (ph - D) * T)
    fig, ax = new("Buck converter inductor current (continuous conduction)")
    ax.plot(t * 1e6, iL, color=ACCENT, label="inductor current i_L")
    ax.axhline(Iout, color=ACCENT2, ls="--", label="average = load current")
    ax.set_xlabel("time (us)"), ax.set_ylabel("current (A)"), ax.set_ylim(1.0, 3.2), ax.legend(loc="upper center", ncol=2)
    ax.text(0.01, 0.05, f"illustrative: V_in 12 V, D = 0.5, L = 22 uH, f_s = 100 kHz\nV_out = D V_in = {Vout:.0f} V;  ripple = (V_in - V_out) D T / L = {dI:.2f} A", transform=ax.transAxes, fontsize=8)
    save(fig, "power-electronics-converters", 1, "buck_inductor_current",
         "The inductor ramps up while the switch is on and down while it is off; the ripple is set by L and the switching frequency.", "buck")


def conversion_ratio():
    D = np.linspace(0.01, 0.9, 400)
    fig, ax = new("Ideal DC conversion ratio M(D) = V_out / V_in")
    ax.plot(D, D, color=ACCENT, label="buck: M = D")
    ax.plot(D, 1 / (1 - D), color=ACCENT2, label="boost: M = 1 / (1 - D)")
    ax.plot(D, -D / (1 - D), color=ACCENT3, label="buck-boost: M = -D / (1 - D)")
    ax.set_ylim(-6, 6), ax.set_xlabel("duty cycle D"), ax.set_ylabel("M(D)"), ax.legend(loc="upper left")
    save(fig, "power-electronics-converters", 2, "conversion_ratio",
         "Duty cycle sets the output: a buck steps down, a boost steps up (with the gain blowing up as D tends to 1), a buck-boost inverts.", "topologies")


# ---------------------------------------------------------------- RF
def fspl():
    d = np.logspace(0, 4, 300)  # metres
    c0 = 2.998e8
    fig, ax = new("Free-space path loss: FSPL = 20 log10(4 pi d f / c)")
    for f, name, c in [(2.4e9, "2.4 GHz (Wi-Fi)", ACCENT), (5.8e9, "5.8 GHz", ACCENT3), (28e9, "28 GHz (mmWave)", ACCENT2)]:
        ax.semilogx(d, 20 * np.log10(4 * np.pi * d * f / c0), color=c, label=name)
    ax.set_xlabel("distance (m)"), ax.set_ylabel("path loss (dB)"), ax.legend(loc="upper left")
    ax.text(0.99, 0.05, "+20 dB per decade of distance;  +20 dB per decade of frequency", transform=ax.transAxes, ha="right", fontsize=9)
    save(fig, "rf-antennas-microwaves", 1, "free_space_path_loss",
         "Friis free-space loss grows 20 dB per decade of distance and with frequency, which is why mmWave needs high-gain antennas.", "links")


def return_loss():
    ZL = np.logspace(0.5, 3, 400)
    Z0 = 50.0
    G = np.abs((ZL - Z0) / (ZL + Z0))
    fig, ax = new("Mismatch of a real load on a 50 ohm line")
    ax.semilogx(ZL, -20 * np.log10(np.clip(G, 1e-4, None)), color=ACCENT, label="return loss (dB)")
    ax.set_ylabel("return loss (dB)", color=ACCENT), ax.set_ylim(0, 40)
    ax2 = ax.twinx()
    ax2.semilogx(ZL, (1 + G) / (1 - np.clip(G, 0, 0.999)), color=ACCENT2, label="VSWR")
    ax2.set_ylim(1, 20), ax2.set_ylabel("VSWR", color=ACCENT2), ax2.grid(False), ax2.spines["right"].set_visible(True)
    ax.set_xlabel("load resistance Z_L (ohm)"+chr(10)+"Gamma = (Z_L - Z_0)/(Z_L + Z_0);  perfect match at Z_L = Z_0 = 50 ohm")
    save(fig, "rf-antennas-microwaves", 2, "reflection_vswr",
         "Reflection coefficient, return loss and VSWR for a resistive load on a 50 ohm line: only Z_L = Z_0 absorbs everything.", "matching")


# ---------------------------------------------------------------- sensors / control
def resonator():
    w = np.logspace(-1, 1, 600)
    fig, ax = new("MEMS resonator: second-order amplitude response")
    for Q, c in [(0.5, ACCENT3), (5, ACCENT), (50, ACCENT2)]:
        H = 1 / np.sqrt((1 - w**2) ** 2 + (w / Q) ** 2)
        ax.loglog(w, H, color=c, label=f"Q = {Q}")
    ax.set_xlabel("frequency / natural frequency"), ax.set_ylabel("|x / x_static|"), ax.legend(loc="lower left")
    ax.text(0.99, 0.9, "peak ~ Q at resonance;  -3 dB width ~ f_0 / Q", transform=ax.transAxes, ha="right", fontsize=9)
    save(fig, "sensors-mems-control", 1, "mems_resonator_response",
         "A mass-spring-damper is the model for most MEMS: a high Q gives a tall, narrow resonance, ideal for sensing small shifts.", "mems")


def pid_step():
    def sim(Kp, Ki, Kd, T=14, dt=0.002):
        n = int(T / dt)
        x = np.zeros(3)
        integ = 0.0
        prev_e = 1.0
        y_out = np.zeros(n)
        for k in range(n):
            e = 1.0 - x[2]
            integ += e * dt
            u = Kp * e + Ki * integ + Kd * (e - prev_e) / dt if k else Kp * e
            prev_e = e
            dx = np.array([-x[0] + u, -x[1] + x[0], -x[2] + x[1]])  # G(s) = 1/(s+1)^3
            x = x + dx * dt
            y_out[k] = x[2]
        return np.arange(n) * dt, y_out

    fig, ax = new("Step response of a third-order plant G(s) = 1/(s+1)^3")
    for (Kp, Ki, Kd), c, lab in [((2, 0, 0), ACCENT3, "P  (Kp = 2)"), ((2, 1, 0), ACCENT2, "PI (Kp = 2, Ki = 1)"), ((2, 1, 1), ACCENT, "PID (Kp = 2, Ki = 1, Kd = 1)")]:
        t, y = sim(Kp, Ki, Kd)
        ax.plot(t, y, color=c, label=lab)
    ax.axhline(1, color=GRID, ls="--"), ax.set_xlabel("time (s)"), ax.set_ylabel("output"), ax.legend(loc="lower right")
    ax.text(0.01, 0.9, "illustrative gains, forward-Euler simulation\nP leaves a steady-state error; I removes it; D damps the overshoot", transform=ax.transAxes, fontsize=8)
    save(fig, "sensors-mems-control", 2, "pid_step_response",
         "Proportional control leaves an offset, integral action removes it at the cost of overshoot, and derivative action damps it.", "control")


if __name__ == "__main__":
    for fn in [ring_resonator, slab_modes, responsivity, laser_li, fresnel, skin_depth, deal_grove, yield_models, rayleigh, photon_budget,
               mosfet_iv, subthreshold, inverter_vtc, power_delay, buck_waveform, conversion_ratio, fspl, return_loss, resonator, pid_step]:
        fn()
    import json

    (ROOT / "bin" / "ee_figures_manifest.json").write_text(
        json.dumps([{"slug": s, "stem": t, "caption": c, "topic": tp} for s, t, c, tp in FIGS], indent=1), encoding="utf-8")
    print(f"{len(FIGS)} figures written")
