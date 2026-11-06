import {
  ScannedStock,
  SectorMomentumCluster,
  SignalCorrelationPair,
  SectorCorrelationMatrixData,
  ClusterType,
} from '../types';

/**
 * Signal Correlation Engine
 * Analyzes co-occurrence of BUY/SELL signals across the Nifty 200 to identify sector-wide momentum clusters
 */

// Helper to normalize sector names into canonical baskets
export function normalizeSectorName(rawSector: string | undefined): string {
  if (!rawSector) return 'Diversified';
  const s = rawSector.toLowerCase();

  if (s.includes('bank') || s.includes('financ') || s.includes('nbfc') || s.includes('insur')) {
    return 'Banking & Financials';
  }
  if (s.includes('tech') || s.includes('it') || s.includes('software') || s.includes('info')) {
    return 'IT & Technology';
  }
  if (s.includes('auto') || s.includes('motor') || s.includes('vehicle')) {
    return 'Automobile & Auto Ancillary';
  }
  if (s.includes('pharma') || s.includes('health') || s.includes('drug') || s.includes('biotech')) {
    return 'Pharma & Healthcare';
  }
  if (s.includes('metal') || s.includes('steel') || s.includes('alumin') || s.includes('mining') || s.includes('iron')) {
    return 'Metals & Mining';
  }
  if (s.includes('energy') || s.includes('oil') || s.includes('gas') || s.includes('petro') || s.includes('refin')) {
    return 'Oil, Gas & Energy';
  }
  if (s.includes('fmcg') || s.includes('consumer') || s.includes('food') || s.includes('beverag')) {
    return 'FMCG & Consumer Goods';
  }
  if (s.includes('infra') || s.includes('realt') || s.includes('construct') || s.includes('cement')) {
    return 'Infrastructure & Realty';
  }
  if (s.includes('power') || s.includes('electr') || s.includes('capital') || s.includes('engineer')) {
    return 'Power & Capital Goods';
  }
  if (s.includes('chem') || s.includes('fertiliz')) {
    return 'Chemicals & Fertilizers';
  }

  return rawSector || 'Other Nifty 200';
}

// Convert a stock into a multi-dimensional momentum vector
export function extractStockMomentumVector(stock: ScannedStock): number[] {
  // 1. Signal Direction & Strength (-1.0 to +1.0)
  let sigScore = 0;
  if (stock.signal === 'BUY') sigScore = 1.0;
  else if (stock.signal === 'SELL') sigScore = -1.0;

  // 2. Change % (scaled)
  const changeNorm = Math.max(-5, Math.min(5, stock.changePercent || 0)) / 5;

  // 3. Relative Volume (RVOL)
  const rvol = stock.indicators?.rvol || 1.0;
  const rvolNorm = Math.max(0, Math.min(4, rvol - 1)) / 3;

  // 4. RSI Centered around 50
  const rsi = stock.indicators?.rsi || 50;
  const rsiNorm = (rsi - 50) / 50;

  // 5. VWAP Distance %
  const vwapDist = stock.indicators?.vwap ? ((stock.price - stock.indicators.vwap) / stock.indicators.vwap) * 100 : 0;
  const vwapNorm = Math.max(-3, Math.min(3, vwapDist)) / 3;

  // 6. Overall AI Score (0 to 100 -> -1 to +1)
  const aiScore = stock.aiScore || 50;
  const aiScoreNorm = (aiScore - 50) / 50;

  // 7. Intraday Range Location (High - Low)
  const high = stock.indicators?.high || stock.price;
  const low = stock.indicators?.low || stock.price;
  const rangeLoc = high > low ? ((stock.price - low) / (high - low) - 0.5) * 2 : 0;

  return [
    sigScore * 1.5,
    changeNorm * 1.2,
    rvolNorm * (sigScore >= 0 ? 1 : -1),
    rsiNorm * 1.0,
    vwapNorm * 1.1,
    aiScoreNorm * 1.3,
    rangeLoc * 0.9,
  ];
}

// Compute Pearson correlation between two vectors
export function computeVectorCorrelation(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  const n = vecA.length;
  const meanA = vecA.reduce((sum, val) => sum + val, 0) / n;
  const meanB = vecB.reduce((sum, val) => sum + val, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = vecA[i] - meanA;
    const diffB = vecB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  const denominator = Math.sqrt(denA * denB);
  if (denominator === 0) return 0;

  const corr = num / denominator;
  return Number(Math.max(-1, Math.min(1, corr)).toFixed(2));
}

// Compute comprehensive Signal Correlation Matrix and Sector Clusters
export function analyzeSignalCorrelationMatrix(stocks: ScannedStock[]): SectorCorrelationMatrixData {
  if (!stocks || stocks.length === 0) {
    return {
      sectors: [],
      matrix: {},
      clusters: [],
      topPairs: [],
      marketWideCoOccurrenceIndex: 0,
      broadBasedRallyScore: 0,
      apexBullishCluster: 'N/A',
      apexBearishCluster: 'N/A',
    };
  }

  // 1. Group stocks by normalized sector
  const sectorGroups = new Map<string, ScannedStock[]>();
  const stockVectors = new Map<string, number[]>();

  stocks.forEach((stock) => {
    const sectorName = normalizeSectorName(stock.sector);
    if (!sectorGroups.has(sectorName)) {
      sectorGroups.set(sectorName, []);
    }
    sectorGroups.get(sectorName)!.push(stock);
    stockVectors.set(stock.symbol, extractStockMomentumVector(stock));
  });

  const clusters: SectorMomentumCluster[] = [];
  const sectorNames = Array.from(sectorGroups.keys()).sort((a, b) => {
    return (sectorGroups.get(b)?.length || 0) - (sectorGroups.get(a)?.length || 0);
  });

  // 2. Build Sector Momentum Clusters
  sectorNames.forEach((sectorName) => {
    const sectorStocks = sectorGroups.get(sectorName) || [];
    if (sectorStocks.length < 2) return;

    let buyCount = 0;
    let sellCount = 0;
    let neutralCount = 0;
    let totalRvol = 0;
    let totalChange = 0;

    sectorStocks.forEach((s) => {
      const isBuy = s.signal === 'BUY' || s.changePercent > 0.4 || (s.aiScore || 0) >= 65;
      const isSell = s.signal === 'SELL' || s.changePercent < -0.4 || (s.aiScore || 0) <= 35;

      if (isBuy) buyCount++;
      else if (isSell) sellCount++;
      else neutralCount++;

      totalRvol += s.indicators?.rvol || 1.0;
      totalChange += s.changePercent || 0;
    });

    const total = sectorStocks.length;
    const dominantDirCount = Math.max(buyCount, sellCount);
    const coOccurrenceRate = Number(((dominantDirCount / total) * 100).toFixed(1));
    const avgRvol = Number((totalRvol / total).toFixed(2));
    const avgChangePct = Number((totalChange / total).toFixed(2));

    // Calculate intra-sector average correlation
    let intraCorrSum = 0;
    let intraCorrPairs = 0;
    for (let i = 0; i < sectorStocks.length; i++) {
      for (let j = i + 1; j < sectorStocks.length; j++) {
        const vA = stockVectors.get(sectorStocks[i].symbol);
        const vB = stockVectors.get(sectorStocks[j].symbol);
        if (vA && vB) {
          intraCorrSum += computeVectorCorrelation(vA, vB);
          intraCorrPairs++;
        }
      }
    }
    const avgCorrelation = intraCorrPairs > 0 ? Number((intraCorrSum / intraCorrPairs).toFixed(2)) : 0.65;

    // Cluster Type & Intensity determination
    let clusterType: ClusterType = 'NEUTRAL_CHOP';
    let clusterIntensity = 50;

    if (buyCount >= total * 0.6) {
      clusterType = avgRvol >= 1.3 ? 'BULLISH_SURGE' : 'ROTATION_INFLOW';
      clusterIntensity = Math.min(98, Math.round(coOccurrenceRate * 0.7 + (avgRvol - 1) * 20 + avgChangePct * 6));
    } else if (sellCount >= total * 0.6) {
      clusterType = 'BEARISH_LIQUIDATION';
      clusterIntensity = Math.min(98, Math.round(coOccurrenceRate * 0.7 + (avgRvol - 1) * 20 + Math.abs(avgChangePct) * 6));
    } else {
      clusterType = 'NEUTRAL_CHOP';
      clusterIntensity = Math.round(coOccurrenceRate * 0.6);
    }

    // Identify Sector Leader (Highest RVOL + Positive Change + Highest AI Score)
    const sortedByMomentum = [...sectorStocks].sort((a, b) => {
      const scoreA = (a.changePercent || 0) * 1.5 + (a.indicators?.rvol || 1) * 2 + (a.aiScore || 50) * 0.05;
      const scoreB = (b.changePercent || 0) * 1.5 + (b.indicators?.rvol || 1) * 2 + (b.aiScore || 50) * 0.05;
      return scoreB - scoreA;
    });

    const leaderStock = sortedByMomentum[0];

    // Identify Lagging Sympathy Stock (High intra-sector correlation with leader, but lower % change -> breakout catch-up trade)
    let bestSympathy = sortedByMomentum[sortedByMomentum.length - 1];
    let maxCatchUpPotential = 0;

    const leaderVec = stockVectors.get(leaderStock.symbol);
    sectorStocks.forEach((cand) => {
      if (cand.symbol !== leaderStock.symbol) {
        const candVec = stockVectors.get(cand.symbol);
        if (leaderVec && candVec) {
          const pairCorr = computeVectorCorrelation(leaderVec, candVec);
          if (pairCorr >= 0.55) {
            const spread = (leaderStock.changePercent || 0) - (cand.changePercent || 0);
            if (spread > maxCatchUpPotential && (cand.changePercent || 0) >= -0.8) {
              maxCatchUpPotential = spread;
              bestSympathy = cand;
            }
          }
        }
      }
    });

    const potentialCatchUpPct = Number(Math.max(0.8, maxCatchUpPotential).toFixed(2));

    // Generate Quantitative AI Cluster Insight
    let aiInsight = '';
    if (clusterType === 'BULLISH_SURGE') {
      aiInsight = `${sectorName} is displaying synchronized institutional accumulation (${coOccurrenceRate}% BUY co-occurrence, avg RVOL ${avgRvol}x). ${leaderStock.symbol} is leading the apex surge (+${leaderStock.changePercent}%); ${bestSympathy.symbol} is lagging with +${potentialCatchUpPct}% sympathy catch-up runway.`;
    } else if (clusterType === 'ROTATION_INFLOW') {
      aiInsight = `Sector rotation capital flowing into ${sectorName} with steady breadth (${coOccurrenceRate}% alignment). Expect rotational continuation if ${leaderStock.symbol} holds above intraday VWAP.`;
    } else if (clusterType === 'BEARISH_LIQUIDATION') {
      aiInsight = `Broad-based distribution across ${sectorName} (${coOccurrenceRate}% SELL co-occurrence). Heavy institutional selling pressure led by ${sortedByMomentum[sortedByMomentum.length - 1].symbol}. Avoid aggressive long sympathy plays.`;
    } else {
      aiInsight = `${sectorName} is currently in a fragmented consolidation regime. Intra-sector dispersion is high (avg correlation $\\rho = ${avgCorrelation}$). Focus purely on individual stock catalysts rather than sector basket trades.`;
    }

    clusters.push({
      id: `cluster-${sectorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      sectorName,
      clusterType,
      clusterIntensity,
      signalCoOccurrenceRate: coOccurrenceRate,
      buySignalsCount: buyCount,
      sellSignalsCount: sellCount,
      neutralCount,
      totalStocks: total,
      avgRvol,
      avgChangePct,
      avgCorrelation,
      leaderStock: {
        symbol: leaderStock.symbol,
        name: leaderStock.name || leaderStock.symbol,
        changePercent: Number((leaderStock.changePercent || 0).toFixed(2)),
        rvol: Number((leaderStock.indicators?.rvol || 1.0).toFixed(2)),
        signal: (leaderStock.changePercent || 0) >= 0 ? 'BUY' : 'SELL',
        price: leaderStock.price,
        aiScore: leaderStock.aiScore || 75,
      },
      sympathyStock: {
        symbol: bestSympathy.symbol,
        name: bestSympathy.name || bestSympathy.symbol,
        changePercent: Number((bestSympathy.changePercent || 0).toFixed(2)),
        rvol: Number((bestSympathy.indicators?.rvol || 1.0).toFixed(2)),
        signal: (bestSympathy.changePercent || 0) >= 0 ? 'BUY' : 'SELL',
        price: bestSympathy.price,
        potentialCatchUpPct,
        aiScore: bestSympathy.aiScore || 68,
      },
      stocks: sectorStocks,
      aiClusterInsight: aiInsight,
    });
  });

  // Sort clusters by intensity (descending)
  clusters.sort((a, b) => b.clusterIntensity - a.clusterIntensity);

  // 3. Build Inter-Sector Correlation Matrix
  const majorSectors = clusters.slice(0, 8).map((c) => c.sectorName);
  const matrix: Record<string, Record<string, number>> = {};

  majorSectors.forEach((secA) => {
    matrix[secA] = {};
    const stocksA = sectorGroups.get(secA) || [];

    // Calculate mean vector for Sector A
    const meanVecA = computeSectorMeanVector(stocksA, stockVectors);

    majorSectors.forEach((secB) => {
      if (secA === secB) {
        matrix[secA][secB] = 1.0;
      } else {
        const stocksB = sectorGroups.get(secB) || [];
        const meanVecB = computeSectorMeanVector(stocksB, stockVectors);
        const corr = computeVectorCorrelation(meanVecA, meanVecB);
        matrix[secA][secB] = corr;
      }
    });
  });

  // 4. Compute Top Correlated & Divergent Stock Pairs for Pair Trading / Sympathy
  const topPairs: SignalCorrelationPair[] = [];
  const sampleStocks = stocks.slice(0, 45); // Representative universe for pair scan

  for (let i = 0; i < sampleStocks.length; i++) {
    for (let j = i + 1; j < sampleStocks.length; j++) {
      const sA = sampleStocks[i];
      const sB = sampleStocks[j];
      const vA = stockVectors.get(sA.symbol);
      const vB = stockVectors.get(sB.symbol);

      if (vA && vB) {
        const corr = computeVectorCorrelation(vA, vB);
        const isSameSector = normalizeSectorName(sA.sector) === normalizeSectorName(sB.sector);

        // Filter for high relevance pairs
        if (Math.abs(corr) >= 0.65 || (isSameSector && Math.abs(corr) >= 0.5)) {
          let relationship: SignalCorrelationPair['relationship'] = 'MODERATE_SYNC';
          if (corr >= 0.78) relationship = 'STRONG_MOMENTUM_SYNC';
          else if (corr <= -0.55) relationship = 'INVERSE_HEDGE';
          else if (Math.abs(corr) < 0.3) relationship = 'UNCORRELATED';

          const leadStock = (sA.changePercent || 0) >= (sB.changePercent || 0) ? sA.symbol : sB.symbol;
          const lagStock = leadStock === sA.symbol ? sB.symbol : sA.symbol;
          const spreadPct = Number(Math.abs((sA.changePercent || 0) - (sB.changePercent || 0)).toFixed(2));
          const coOccurrenceScore = Math.round(((corr + 1) / 2) * 100);

          topPairs.push({
            id: `pair-${sA.symbol}-${sB.symbol}`,
            symbolA: sA.symbol,
            symbolB: sB.symbol,
            nameA: sA.name || sA.symbol,
            nameB: sB.name || sB.symbol,
            sectorA: normalizeSectorName(sA.sector),
            sectorB: normalizeSectorName(sB.sector),
            isSameSector,
            correlation: corr,
            coOccurrenceScore,
            signalA: (sA.changePercent || 0) >= 0.3 ? 'BUY' : (sA.changePercent || 0) <= -0.3 ? 'SELL' : 'NEUTRAL',
            signalB: (sB.changePercent || 0) >= 0.3 ? 'BUY' : (sB.changePercent || 0) <= -0.3 ? 'SELL' : 'NEUTRAL',
            relationship,
            leadStock,
            lagStock,
            spreadPct,
            changePctA: Number((sA.changePercent || 0).toFixed(2)),
            changePctB: Number((sB.changePercent || 0).toFixed(2)),
            rvolA: Number((sA.indicators?.rvol || 1.0).toFixed(2)),
            rvolB: Number((sB.indicators?.rvol || 1.0).toFixed(2)),
          });
        }
      }
    }
  }

  // Sort pairs by absolute correlation (highest first)
  topPairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

  // 5. Market-Wide Metrics
  const totalStocksCount = stocks.length;
  const totalAdvancing = stocks.filter((s) => (s.changePercent || 0) > 0).length;
  const marketWideCoOccurrenceIndex = totalStocksCount > 0 ? Number(((totalAdvancing / totalStocksCount) * 100).toFixed(1)) : 50;

  const bullishClusters = clusters.filter((c) => c.clusterType === 'BULLISH_SURGE' || c.clusterType === 'ROTATION_INFLOW');
  const bearishClusters = clusters.filter((c) => c.clusterType === 'BEARISH_LIQUIDATION');

  const broadBasedRallyScore = Math.min(
    100,
    Math.round(
      (bullishClusters.reduce((sum, c) => sum + c.signalCoOccurrenceRate, 0) / Math.max(1, clusters.length)) * 0.8 +
        (marketWideCoOccurrenceIndex >= 50 ? (marketWideCoOccurrenceIndex - 50) * 1.5 : 0)
    )
  );

  const apexBullishCluster = bullishClusters.length > 0 ? bullishClusters[0].sectorName : 'N/A';
  const apexBearishCluster = bearishClusters.length > 0 ? bearishClusters[0].sectorName : 'None';

  return {
    sectors: majorSectors,
    matrix,
    clusters,
    topPairs: topPairs.slice(0, 30),
    marketWideCoOccurrenceIndex,
    broadBasedRallyScore,
    apexBullishCluster,
    apexBearishCluster,
  };
}

// Compute average vector for a sector
function computeSectorMeanVector(sectorStocks: ScannedStock[], stockVectors: Map<string, number[]>): number[] {
  if (sectorStocks.length === 0) return [0, 0, 0, 0, 0, 0, 0];

  const vecLength = 7;
  const sumVec = new Array(vecLength).fill(0);
  let validCount = 0;

  sectorStocks.forEach((stock) => {
    const vec = stockVectors.get(stock.symbol);
    if (vec) {
      for (let k = 0; k < vecLength; k++) {
        sumVec[k] += vec[k];
      }
      validCount++;
    }
  });

  if (validCount === 0) return [0, 0, 0, 0, 0, 0, 0];
  return sumVec.map((val) => val / validCount);
}
