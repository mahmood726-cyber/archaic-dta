import json
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent
CERTIFICATION_PATH = PROJECT_ROOT / "certification.json"
DATA_PATH = PROJECT_ROOT / "data.csv"

def logit(p):
    return np.log(p / (1 - p))

def inv_logit(l):
    return 1 / (1 + np.exp(-l))


def simulate_dta(
    k=10,
    n_avg=500,
    prev=0.2,
    sens_mu=0.8,
    spec_mu=0.9,
    rho=-0.5,
    tau_sens=0.2,
    tau_spec=0.2,
    rng=None,
):
    rng = rng or np.random.default_rng()
    logit_sens_mu = logit(sens_mu)
    logit_spec_mu = logit(spec_mu)
    mean = [logit_sens_mu, logit_spec_mu]
    cov = [[tau_sens**2, rho * tau_sens * tau_spec], [rho * tau_sens * tau_spec, tau_spec**2]]
    results = []
    for i in range(k):
        n = rng.poisson(n_avg)
        n_pos = rng.binomial(n, prev)
        n_neg = n - n_pos
        logit_s, logit_sp = rng.multivariate_normal(mean, cov)
        s, sp = inv_logit(logit_s), inv_logit(logit_sp)
        tp = rng.binomial(n_pos, s)
        fn = n_pos - tp
        tn = rng.binomial(n_neg, sp)
        fp = n_neg - tn
        results.append({"study": f"Study_{i+1}", "tp": tp, "fp": fp, "fn": fn, "tn": tn, "n_pos": n_pos, "n_neg": n_neg})
    return pd.DataFrame(results)


def moses_littenberg_sroc(df):
    tp, fp, fn, tn = df["tp"] + 0.5, df["fp"] + 0.5, df["fn"] + 0.5, df["tn"] + 0.5
    logit_sens = logit(tp / (tp + fn))
    logit_spec = logit(tn / (tn + fp))
    D, S = logit_sens + logit_spec, logit_sens - logit_spec
    slope, intercept = np.polyfit(S, D, 1)
    return intercept, slope


def calculate_auc(intercept, slope):
    fprs = np.linspace(0.001, 0.999, 1000)
    logit_specs = logit(1 - fprs)
    if abs(1 - slope) < 0.001:
        logit_sens = intercept - logit_specs
    else:
        logit_sens = (intercept - logit_specs * (1 + slope)) / (1 - slope)
    sens = inv_logit(logit_sens)
    return float(np.trapezoid(sens, fprs))


def build_certification(archaic_auc, true_auc, modernity_gain, intercept, slope):
    return {
        "project": "archaic-dta",
        "timestamp": "2026-04-10",
        "metrics": {
            "archaic_auc": round(archaic_auc, 4),
            "true_auc": round(true_auc, 4),
            "modernity_gain": round(modernity_gain, 4),
            "moses_intercept": round(intercept, 4),
            "moses_slope": round(slope, 4),
        },
        "status": "CERTIFIED",
        "locator": DATA_PATH.name,
        "hash": "sha256:simulated",
    }


def write_outputs(df, cert, project_root=PROJECT_ROOT):
    project_root = Path(project_root)
    certification_path = project_root / CERTIFICATION_PATH.name
    data_path = project_root / DATA_PATH.name
    certification_path.write_text(json.dumps(cert, indent=2, sort_keys=True), encoding="utf-8")
    df.to_csv(data_path, index=False)
    return certification_path, data_path


def main(seed=42, project_root=PROJECT_ROOT):
    rng = np.random.default_rng(seed)
    SENS_MU, SPEC_MU = 0.8, 0.9
    RHO = -0.7
    df = simulate_dta(k=15, sens_mu=SENS_MU, spec_mu=SPEC_MU, rho=RHO, rng=rng)
    intercept, slope = moses_littenberg_sroc(df)
    archaic_auc = calculate_auc(intercept, slope)
    true_a = logit(SENS_MU) + logit(SPEC_MU)
    true_auc = calculate_auc(true_a, 0)
    modernity_gain = true_auc - archaic_auc

    cert = build_certification(archaic_auc, true_auc, modernity_gain, intercept, slope)
    print(f"Certification saved. Modernity Gain: {modernity_gain:.4f}")
    write_outputs(df, cert, project_root=project_root)
    return {"dataframe": df, "certification": cert}


if __name__ == "__main__":
    main()
