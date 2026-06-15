# Truth-Recovery Report -- archaic-dta

**Engine class:** DISTINCT DTA engine (NOT a dup of the bivariate-pool siblings).
archaic-dta deliberately ships only 1980s-era DTA methods:
- **Moses-Littenberg SROC** -- OLS of `D = logit(Se)+logit(Sp)` on `S = logit(Se)-logit(Sp)`, 0.5 continuity correction on every cell (`simulation.py::moses_littenberg_sroc`, also drawn as the SROC curve in `index.html`).
- **Independent fixed-effect pooling** of sensitivity and specificity -- the two numbers the dashboard prints ("Independent Pooled Sensitivity 0.803 / Specificity 0.900"). No between-study `tau^2`, no bivariate covariance.

This is a genuinely different estimand from the bivariate logit-normal RE pool in
`dta-meta-analysis-pro` / `dta-pro-v3.7` (their `improvedBivariatePool` is a
DerSimonian-Laird bivariate RE pool). The functions here are NOT byte-identical to
any swept sibling. Proceeded with the sweep.

## VERDICT: HONEST-NEGATIVE (confirmed, by design) + IMPROVEMENT (fix shipped)

The project's own `simulation.py` advertises a `modernity_gain = true_auc - archaic_auc`,
implicitly admitting the archaic methods miss the truth. This harness *quantifies*
that miss with the project's own functions against a known-truth bivariate
logit-normal DGP (`sens_i = expit(logit(Se)+uA_i)`, `spec_i = expit(logit(Sp)+uB_i)`,
`TP~Bin(nDis,sens_i)`, `TN~Bin(nHeal,spec_i)`; estimand Se=expit(muA)=0.80,
Sp=expit(muB)=0.90). 1200-2000 reps, k=12, seed 20260615.

## Results (95% nominal coverage)

| scenario | Cov Se (FE) | Cov Sp (FE) | Cov Se (RE-fix) | Cov Sp (RE-fix) | width FE | width RE | Moses AUC | true AUC | AUC bias |
|----------|-------------|-------------|-----------------|-----------------|----------|----------|-----------|----------|----------|
| het_low  | 0.750 | 0.749 | 0.949 | 0.929 | 0.047 | 0.075 | 0.898 | 0.922 | -0.024 |
| het_mod  | 0.471 | 0.433 | 0.943 | 0.919 | 0.049 | 0.114 | 0.904 | 0.922 | -0.018 |
| het_high | 0.253 | 0.202 | 0.934 | 0.919 | 0.053 | 0.163 | 0.904 | 0.922 | -0.018 |
| het_corr | 0.436 | 0.441 | 0.945 | 0.927 | 0.049 | 0.114 | 0.909 | 0.922 | -0.013 |

## Findings

1. **Independent FE pooling catastrophically under-covers.** Sensitivity-CI coverage
   falls from 75% (low heterogeneity) to 25% (high), specificity 75% -> 20%,
   against a nominal 95%. Root cause: with no `tau^2` term the CI width is frozen
   (~0.047-0.053) no matter how heterogeneous the truth is. It physically cannot
   widen. This is the canonical failure of pre-bivariate "independent pooling" and
   it is real here, as measured.

2. **The Moses-Littenberg SROC AUC is biased low** by 0.013-0.024 vs the true SROC
   AUC (0.922). Small but consistent and negative across all four scenarios --
   exactly the direction the project's `modernity_gain` claims. The 0.5-cc
   OLS-on-summary-points regression mildly under-states discrimination.

3. **A minimal honest fix restores coverage.** Adding DerSimonian-Laird `tau^2` per
   axis and a `t_{k-1}` critical value (still independent, still non-bivariate)
   lifts coverage to 92-95% everywhere, and the CI width now tracks true
   heterogeneity (0.075 -> 0.163). Shipped as `independentPoolRE` in `harness.mjs`.

## Recommendation

archaic-dta is an intentional "what the 1980s gave you" teaching artifact, so the
under-coverage is a feature of the demonstration, not a hidden bug. But the
dashboard prints the FE pooled Se/Sp as bare points and does not warn the reader
that those numbers carry essentially no valid uncertainty under heterogeneity.
Recommend either (a) labelling the independent-pool block as "naive / no
heterogeneity correction -- CIs not valid under between-study variation", or
(b) adopting the shipped `independentPoolRE` (or upgrading to the bivariate sibling
engine) if any inferential use is intended. The Moses AUC's negative bias should be
cited when the SROC curve is read quantitatively.

## Artifacts
- `engine.mjs` -- VERBATIM port of the repo's moses_littenberg_sroc / calculate_auc plus the dashboard's independent FE pool.
- `dgp-dta.mjs` -- standalone seeded known-truth bivariate DTA DGP (matches the repo's own simulate_dta model).
- `harness.mjs` -- coverage + AUC-bias measurement; RE fix.
- `test-truth-recovery.mjs` -- 6 assertions, all pass (node --test).
