import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBtstConfluenceConfidence,
  computeGaugeArcGeometry,
} from './btstConfidence';

test('computeBtstConfluenceConfidence scores high-confluence A+ BTST setups in 82-100 High tier', () => {
  const metrics = computeBtstConfluenceConfidence({
    symbol: 'ULTRACEMCO',
    btstScore: 92,
    conditionsMet: 7,
    totalConditions: 7,
    gapEdgeProbabilityPct: 83,
    deliveryConvictionPct: 96,
  });

  // 92*0.45 + 100*0.25 + 83*0.18 + 96*0.12 = 41.4 + 25 + 14.94 + 11.52 = 92.86 -> 93
  assert.equal(metrics.score, 93);
  assert.equal(metrics.tier, 'High');
  assert.equal(metrics.passedChecks, 7);
  assert.equal(metrics.totalChecks, 7);
  assert.match(metrics.ariaLabel, /ULTRACEMCO.*93 out of 100.*High/);
});

test('computeBtstConfluenceConfidence classifies Strong, Moderate, and Caution tiers accurately with 0-100 clamping', () => {
  const strong = computeBtstConfluenceConfidence({
    symbol: 'SBIN',
    btstScore: 76,
    conditionsMet: 6,
    totalConditions: 7,
    gapEdgeProbabilityPct: 70,
    deliveryConvictionPct: 75,
  });
  assert.equal(strong.tier, 'Strong');
  assert.ok(strong.score >= 70 && strong.score < 82);

  const moderate = computeBtstConfluenceConfidence({
    symbol: 'NAVINFLUOR',
    btstScore: 62,
    conditionsMet: 5,
    totalConditions: 7,
    gapEdgeProbabilityPct: 58,
    deliveryConvictionPct: 60,
  });
  assert.equal(moderate.tier, 'Moderate');
  assert.ok(moderate.score >= 55 && moderate.score < 70);

  const extremeHigh = computeBtstConfluenceConfidence({
    symbol: 'MAXOUT',
    btstScore: 150,
    conditionsMet: 10,
    totalConditions: 7,
    gapEdgeProbabilityPct: 120,
    deliveryConvictionPct: 140,
  });
  assert.equal(extremeHigh.score, 100);

  const zeroLow = computeBtstConfluenceConfidence({
    symbol: 'MINOUT',
    btstScore: -10,
    conditionsMet: 0,
    totalConditions: 7,
    gapEdgeProbabilityPct: 0,
    deliveryConvictionPct: 0,
  });
  assert.equal(zeroLow.score, 0);
  assert.equal(zeroLow.tier, 'Caution');
});

test('computeGaugeArcGeometry produces valid monotonic 270-degree dashoffset values', () => {
  const g0 = computeGaugeArcGeometry(0, 16);
  const g50 = computeGaugeArcGeometry(50, 16);
  const g100 = computeGaugeArcGeometry(100, 16);

  assert.equal(g0.progressDashOffset, g0.arcLength);
  assert.equal(g100.progressDashOffset, 0);
  assert.ok(g50.progressDashOffset > 0 && g50.progressDashOffset < g0.arcLength);
});
