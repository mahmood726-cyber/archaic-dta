// engine.mjs -- pure ARCHAIC-DTA pooling core EXTRACTED VERBATIM from the repo's
// own engine (simulation.py: moses_littenberg_sroc / calculate_auc, and the
// "Independent Pooled Sensitivity/Specificity" shown in index.html).
//
// archaic-dta is NOT a bivariate random-effects DTA engine. By design it ships
// only 1980s-era methods:
//   (1) Moses-Littenberg SROC  -- OLS regression of D = logit(Se)+logit(Sp) on
//       S = logit(Se)-logit(Sp), with 0.5 continuity correction on every cell.
//   (2) Independent fixed-effect pooling of sensitivity and specificity (the two
//       numbers the dashboard prints as "Independent Pooled Sensitivity/Spec").
//
// The Python below is translated line-for-line; the algebra (cc=+0.5, D/S
// definitions, polyfit slope/intercept, AUC via the logit_s = (a - logit_sp*(1+b))
// /(1-b) inversion, trapezoid over fpr) is preserved unchanged so the harness
// measures the SAME math the project ships.

const logit = (p) => Math.log(p / (1 - p));
const invLogit = (l) => 1 / (1 + Math.exp(-l));

// ---- ordinary-least-squares slope/intercept, == np.polyfit(x, y, 1) ----
function polyfit1(x, y) {
  const n = x.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// VERBATIM port of simulation.py::moses_littenberg_sroc
// df rows: {tp, fp, fn, tn}. Returns {intercept, slope}.
function mosesLittenbergSroc(studies) {
  const D = [], S = [];
  for (const s of studies) {
    const tp = s.tp + 0.5, fp = s.fp + 0.5, fn = s.fn + 0.5, tn = s.tn + 0.5;
    const logitSens = logit(tp / (tp + fn));
    const logitSpec = logit(tn / (tn + fp));
    D.push(logitSens + logitSpec);
    S.push(logitSens - logitSpec);
  }
  const { slope, intercept } = polyfit1(S, D);
  return { intercept, slope };
}

// VERBATIM port of simulation.py::calculate_auc
function calculateAuc(intercept, slope, nGrid = 1000) {
  const fprs = [];
  for (let i = 0; i < nGrid; i++) fprs.push(0.001 + (0.999 - 0.001) * i / (nGrid - 1));
  const sens = fprs.map((fpr) => {
    const logitSpec = logit(1 - fpr);
    let logitSens;
    if (Math.abs(1 - slope) < 0.001) logitSens = intercept - logitSpec;
    else logitSens = (intercept - logitSpec * (1 + slope)) / (1 - slope);
    return invLogit(logitSens);
  });
  // np.trapezoid(sens, fprs)
  let area = 0;
  for (let i = 1; i < fprs.length; i++) area += (fprs[i] - fprs[i - 1]) * (sens[i] + sens[i - 1]) / 2;
  return area;
}

// The two dashboard numbers: "Independent Pooled Sensitivity / Specificity".
// This is naive fixed-effect inverse-variance pooling on the logit scale,
// done SEPARATELY for sens and spec (the "Independent Pooling" the project
// advertises -- no between-study tau^2, no bivariate covariance). CI uses a
// z critical value (archaic default). 0.5 cc on zero cells, matching the engine.
function independentPool(studies, conf = 0.95) {
  const z = qnorm(1 - (1 - conf) / 2);
  function pool(get1, get0) {
    let sumWY = 0, sumW = 0;
    for (const s of studies) {
      let a = get1(s), b = get0(s);
      if (a === 0 || b === 0) { a += 0.5; b += 0.5; }
      const y = logit(a / (a + b));
      const v = 1 / a + 1 / b;             // var of logit proportion
      const w = 1 / v;
      sumWY += w * y; sumW += w;
    }
    const mu = sumWY / sumW;
    const se = 1 / Math.sqrt(sumW);
    return { est: invLogit(mu), lo: invLogit(mu - z * se), hi: invLogit(mu + z * se), mu, se };
  }
  const sens = pool((s) => s.tp, (s) => s.fn);
  const spec = pool((s) => s.tn, (s) => s.fp);
  return { sens, spec };
}

// Beasley-Springer-Moro / Acklam inverse normal CDF (self-contained).
function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

export { mosesLittenbergSroc, calculateAuc, independentPool, logit, invLogit, qnorm, polyfit1 };
