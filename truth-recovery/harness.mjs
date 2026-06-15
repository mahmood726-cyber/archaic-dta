// harness.mjs -- truth-recovery measurement for the ARCHAIC-DTA engine.
//
// The project's own simulation.py computes "modernity_gain = true_auc -
// archaic_auc", implicitly asserting the 1980s methods MISS the truth. This
// harness quantifies that miss with the project's OWN functions:
//
//  (A) Independent fixed-effect pooling (the two dashboard numbers): MEASURE
//      coverage of true Se/Sp by its z-CIs across heterogeneity scenarios.
//      Hypothesis: ignoring between-study tau^2 -> CIs too narrow -> under-cover.
//  (B) Moses-Littenberg SROC: MEASURE recovery of the true SROC-curve AUC.
//      Hypothesis: continuity-corrected OLS-on-summary-points is biased.
//
//  (C) FIX: a genuine random-effects pool (DerSimonian-Laird tau^2 added to each
//      logit variance, t_{k-1} critical value) for the SAME logit-pool target,
//      to show how much of the coverage gap is repairable while staying within
//      "independent (non-bivariate)" pooling.

import { mosesLittenbergSroc, calculateAuc, independentPool, logit, invLogit, qnorm } from './engine.mjs';
import { generate, makeRng, SCENARIOS } from './dgp-dta.mjs';

// Student-t quantile (Cornish-Fisher off normal), self-contained -- for the fix.
function tQuantile(p, df) {
  if (df >= 200) return qnorm(p);
  const z = qnorm(p);
  const g1 = (z**3 + z) / 4;
  const g2 = (5*z**5 + 16*z**3 + 3*z) / 96;
  const g3 = (3*z**7 + 19*z**5 + 17*z**3 - 15*z) / 384;
  const g4 = (79*z**9 + 776*z**7 + 1482*z**5 - 1920*z**3 - 945*z) / 92160;
  return z + g1/df + g2/(df*df) + g3/(df**3) + g4/(df**4);
}

// (C) Genuine RE independent pool: DL tau^2 per axis, t_{k-1} CI. Independent
// (no bivariate covariance) -- the minimal honest upgrade of (A).
function independentPoolRE(studies, conf = 0.95) {
  const k = studies.length;
  const tcrit = tQuantile(1 - (1 - conf) / 2, Math.max(1, k - 1));
  function pool(get1, get0) {
    const ys = [], vs = [];
    for (const s of studies) {
      let a = get1(s), b = get0(s);
      if (a === 0 || b === 0) { a += 0.5; b += 0.5; }
      ys.push(logit(a / (a + b)));
      vs.push(1 / a + 1 / b);
    }
    const w = vs.map((v) => 1 / v);
    const sumW = w.reduce((x, y) => x + y, 0);
    const muFE = ys.reduce((x, y, i) => x + y * w[i], 0) / sumW;
    const Q = ys.reduce((x, y, i) => x + w[i] * (y - muFE) ** 2, 0);
    const C = sumW - w.reduce((x, wi) => x + wi * wi, 0) / sumW;
    const tau2 = Math.max(0, (Q - (k - 1)) / C);
    const wre = vs.map((v) => 1 / (v + tau2));
    const sumWre = wre.reduce((x, y) => x + y, 0);
    const mu = ys.reduce((x, y, i) => x + y * wre[i], 0) / sumWre;
    const se = 1 / Math.sqrt(sumWre);
    return { lo: invLogit(mu - tcrit * se), hi: invLogit(mu + tcrit * se) };
  }
  return { sens: pool((s) => s.tp, (s) => s.fn), spec: pool((s) => s.tn, (s) => s.fp) };
}

// True SROC-curve AUC for the known-truth model: the curve is the set of
// (1-spec_i, sens_i) traced as a common threshold-shift moves both logits. With
// independent uA,uB the population SROC is symmetric; we integrate the true
// expected sens at each fpr using the generative means (slope b -> 0 limit gives
// logit_s = muA - (logit_sp - muB), i.e. the calculateAuc with intercept=muA+muB,
// slope from the implied covariance). We take the well-defined comparator AUC
// the project itself uses: calculateAuc(muA+muB, 0).
function trueSrocAuc(SeTrue, SpTrue) {
  return calculateAuc(logit(SeTrue) + logit(SpTrue), 0);
}

function runCoverage({ SeTrue = 0.8, SpTrue = 0.9, k = 12, reps = 2000, seed = 20260615 } = {}) {
  const rng = makeRng(seed);
  const out = {};
  for (const scen of SCENARIOS) {
    let covSensFE = 0, covSpecFE = 0, covSensRE = 0, covSpecRE = 0;
    let widthFE = 0, widthRE = 0;
    let aucSum = 0, n = 0;
    const trueAuc = trueSrocAuc(SeTrue, SpTrue);
    for (let r = 0; r < reps; r++) {
      const { studies } = generate(SeTrue, SpTrue, k, scen, rng);
      const fe = independentPool(studies, 0.95);
      const re = independentPoolRE(studies, 0.95);
      if (SeTrue >= fe.sens.lo && SeTrue <= fe.sens.hi) covSensFE++;
      if (SpTrue >= fe.spec.lo && SpTrue <= fe.spec.hi) covSpecFE++;
      if (SeTrue >= re.sens.lo && SeTrue <= re.sens.hi) covSensRE++;
      if (SpTrue >= re.spec.lo && SpTrue <= re.spec.hi) covSpecRE++;
      widthFE += fe.sens.hi - fe.sens.lo;
      widthRE += re.sens.hi - re.sens.lo;
      const { intercept, slope } = mosesLittenbergSroc(studies);
      const auc = calculateAuc(intercept, slope);
      if (isFinite(auc)) { aucSum += auc; n++; }
    }
    out[scen] = {
      covSensFE: covSensFE / reps, covSpecFE: covSpecFE / reps,
      covSensRE: covSensRE / reps, covSpecRE: covSpecRE / reps,
      widthFE: widthFE / reps, widthRE: widthRE / reps,
      mosesAuc: aucSum / n, trueAuc, aucBias: aucSum / n - trueAuc,
    };
  }
  return out;
}

export { runCoverage, independentPoolRE, trueSrocAuc, tQuantile };

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') ||
    process.argv[1] && process.argv[1].endsWith('harness.mjs')) {
  const res = runCoverage();
  console.log('scenario  covSe_FE covSp_FE  covSe_RE covSp_RE  widthFE widthRE  mosesAUC trueAUC  bias');
  for (const [s, v] of Object.entries(res)) {
    console.log(
      s.padEnd(9),
      v.covSensFE.toFixed(3), v.covSpecFE.toFixed(3), ' ',
      v.covSensRE.toFixed(3), v.covSpecRE.toFixed(3), ' ',
      v.widthFE.toFixed(3), v.widthRE.toFixed(3), ' ',
      v.mosesAuc.toFixed(3), v.trueAuc.toFixed(3), v.aucBias.toFixed(3),
    );
  }
}
