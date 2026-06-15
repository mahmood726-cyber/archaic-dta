// node --test  -- truth-recovery assertions for archaic-dta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCoverage } from './harness.mjs';
import { mosesLittenbergSroc, independentPool } from './engine.mjs';

// Fewer reps in CI for speed; conclusions are large-effect and stable.
const res = runCoverage({ reps: 1200, seed: 20260615 });

test('independent FE pooling under-covers true Se under high heterogeneity', () => {
  // Ignoring between-study tau^2 collapses coverage far below nominal 0.95.
  assert.ok(res.het_high.covSensFE < 0.55,
    `expected FE Se coverage <0.55 under het_high, got ${res.het_high.covSensFE}`);
  assert.ok(res.het_high.covSpecFE < 0.55,
    `expected FE Spec coverage <0.55 under het_high, got ${res.het_high.covSpecFE}`);
});

test('FE under-coverage worsens monotonically as heterogeneity rises', () => {
  assert.ok(res.het_low.covSensFE > res.het_mod.covSensFE,
    `low(${res.het_low.covSensFE}) should exceed mod(${res.het_mod.covSensFE})`);
  assert.ok(res.het_mod.covSensFE > res.het_high.covSensFE,
    `mod(${res.het_mod.covSensFE}) should exceed high(${res.het_high.covSensFE})`);
});

test('genuine RE fix (DL tau^2 + t_{k-1}) restores Se coverage to ~nominal', () => {
  for (const scen of Object.keys(res)) {
    assert.ok(res[scen].covSensRE >= 0.90,
      `RE Se coverage should be >=0.90 in ${scen}, got ${res[scen].covSensRE}`);
  }
});

test('RE CIs widen with true heterogeneity while FE CIs stay flat', () => {
  // FE width barely moves; RE width grows substantially low->high.
  assert.ok(res.het_high.widthRE > 2 * res.het_low.widthRE,
    `RE width should grow with heterogeneity (${res.het_low.widthRE} -> ${res.het_high.widthRE})`);
  assert.ok(Math.abs(res.het_high.widthFE - res.het_low.widthFE) < 0.02,
    `FE width should be ~flat, got ${res.het_low.widthFE} vs ${res.het_high.widthFE}`);
});

test('Moses-Littenberg SROC AUC is biased low vs the true SROC AUC', () => {
  // Small but consistent negative bias across scenarios.
  for (const scen of Object.keys(res)) {
    assert.ok(res[scen].aucBias < 0,
      `Moses AUC bias should be negative in ${scen}, got ${res[scen].aucBias}`);
  }
});

test('engine functions run and return finite, in-range estimates', () => {
  const studies = [
    { tp: 84, fp: 38, fn: 16, tn: 354 }, { tp: 83, fp: 46, fn: 24, tn: 371 },
    { tp: 80, fp: 40, fn: 17, tn: 335 }, { tp: 69, fp: 37, fn: 18, tn: 383 },
  ];
  const { intercept, slope } = mosesLittenbergSroc(studies);
  assert.ok(isFinite(intercept) && isFinite(slope));
  const p = independentPool(studies);
  assert.ok(p.sens.est > 0 && p.sens.est < 1 && p.spec.est > 0 && p.spec.est < 1);
  assert.ok(p.sens.lo < p.sens.est && p.sens.est < p.sens.hi);
});
