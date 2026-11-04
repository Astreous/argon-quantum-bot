// v63 Temiz Turkce & UTF-8 Migrasyonu (Mojibake Onbellek Temizligi)
if (localStorage.getItem('argon_v63_utf8') !== '1') {
  localStorage.removeItem('argon_trades');
  localStorage.removeItem('argon_portfolio_trades');
  localStorage.removeItem('argon_btr_trades');
  localStorage.removeItem('argon_btr_portfolio_v36');
  localStorage.setItem('argon_v63_utf8', '1');
}
// Argon Quant v4.0 | Kurumsal Çoklu-Coin Algoritmik Portföy & 7/24 Bulut Motoru
let backendAvailable = false;
// ARGON Quant v4.0: Hızlı Scalp & 4 Kademeli Kâr Koruması (%25 / %50 / %75 / %100)
const TREND_MODE = true;
let trendPullTick = 0;
let cloudBaseUrl = localStorage.getItem("argon_cloud_url") || "";
let pollTimer = null;
let isScanning = false;
let scanEpoch = 0;
let lastRenderedData = null;
let rotationOffset = 0;

function apiUrl(path) {
  return cloudBaseUrl ? `${cloudBaseUrl.replace(/\/$/, "")}${path}` : path;
}

// Quant v3.5+ temiz başlangıç ve 10,000 TRY kasa migrasyonu
if (!localStorage.getItem("argon_10k_cap_v1")) {
  localStorage.removeItem("argon_trades");
  localStorage.removeItem("argon_portfolio_trades");
  localStorage.removeItem("argon_btr_trades");
  localStorage.removeItem("argon_btr_fees");
  localStorage.removeItem("argon_btr_portfolio_v36");
  localStorage.setItem("argon_v36_clean", "1");
  localStorage.setItem("argon_10k_cap_v1", "1");
}
if (!localStorage.getItem("argon_10k_autostart_v2")) {
  try {
    const cur = JSON.parse(localStorage.getItem("argon_btr_portfolio_v36") || "null");
    if (cur && !cur.running && Object.keys(cur.positions || {}).length === 0) {
      cur.running = true;
      localStorage.setItem("argon_btr_portfolio_v36", JSON.stringify(cur));
    }
  } catch (_) {}
  localStorage.setItem("argon_10k_autostart_v2", "1");
}

const BINANCE_TR_60_COINS = [
  "BTC/TRY", "ETH/TRY", "SOL/TRY", "XRP/TRY", "USDT/TRY",
  "AVAX/TRY", "BNB/TRY", "DOGE/TRY", "TRX/TRY", "ADA/TRY",
  "PEPE/TRY", "SUI/TRY", "SHIB/TRY", "LINK/TRY", "NEAR/TRY",
  "ARB/TRY", "FET/TRY", "INJ/TRY", "TIA/TRY", "WLD/TRY",
  "ENA/TRY", "RENDER/TRY", "FIL/TRY", "ATOM/TRY", "APT/TRY",
  "OP/TRY", "DOT/TRY", "BONK/TRY", "FLOKI/TRY", "SEI/TRY",
  "PAXG/TRY", "CHZ/TRY", "GALA/TRY", "SAND/TRY", "MANA/TRY",
  "AXS/TRY", "AAVE/TRY", "UNI/TRY", "LTC/TRY", "ETC/TRY",
  "BCH/TRY", "ALGO/TRY", "VET/TRY", "ICP/TRY", "GRT/TRY",
  "RUNE/TRY", "PENDLE/TRY", "JUP/TRY", "STRK/TRY", "PYTH/TRY",
  "ARKM/TRY", "EIGEN/TRY", "TRUMP/TRY", "BEAMX/TRY", "BLUR/TRY",
  "ORDI/TRY", "DYDX/TRY", "LDO/TRY", "ENS/TRY", "APE/TRY",
];

const PALETTE = [
  "#f7931a", "#627eea", "#14f195", "#f0b90b", "#00aae4",
  "#e84142", "#3cc8c8", "#c2a633", "#2a5ada", "#4da2ff",
  "#a855f7", "#ec4899", "#10b981", "#f97316", "#06b6d4",
  "#84cc16", "#eab308", "#6366f1", "#14b8a6", "#f43f5e",
];

function getCoinColor(symbol) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const savedPortfolioState = JSON.parse(localStorage.getItem("argon_btr_portfolio_v36") || "null");
let soundEnabled = localStorage.getItem("argon_quantum_sound") !== "0";
let audioCtx = null;

function playQuantumSound(type = "BUY") {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const now = audioCtx.currentTime;
    const notes =
      type === "PARTIAL_TP"
        ? [587.33, 880, 1174.66]
        : type === "PROFIT"
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === "LOCK"
        ? [440, 659.25]
        : type === "LOSS"
        ? [330, 246.94]
        : [440, 554.37, 659.25];

    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type === "LOSS" ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.075);
      gain.gain.setValueAtTime(0.055, now + idx * 0.075);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.075 + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.075);
      osc.stop(now + idx * 0.075 + 0.19);
    });
  } catch (_) {}
}

function toggleQuantumSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("argon_quantum_sound", soundEnabled ? "1" : "0");
  const btn = document.getEİşlementById("btnSoundToggle");
  if (btn) {
    btn.textContent = soundEnabled ? "🔊 SES: AÇIK" : "🔇 SES: KAPALI";
  }
  if (soundEnabled) playQuantumSound("LOCK");
}

const localState = {
  running: savedPortfolioState?.running ?? true,
  cash_usdt: savedPortfolioState?.cash_usdt ?? 10000.0,
  total_fees_paid: Number(localStorage.getItem("argon_btr_fees") || "0"),
  positions: savedPortfolioState?.positions || {},
  equityHistory: savedPortfolioState?.equityHistory || [
    { time: new Date().toLocaleTimeString("tr-TR"), equity: 10000.0 },
  ],
  circuit_breaçıker_tripped: false,
  circuit_breaçıker_reason: "",
  cooldownUntil: {}, // Overtrading önleyici soğuma süresi
  obiCache: {},
  scanner: {},
  candlesCache: {},
  candlesTs: {}, // TTL Cache zaman damgaları (Rate-Limit koruması)
  liveTickers: {},
  market_regime: {
    state: "NEUTRAL",
    label: "🟡 SEÇİCİ / DENGELİ REJİM",
    btc_rsi: 50.0,
    btc_trend: "YATAY",
  },
  trades: JSON.parse(localStorage.getItem("argon_btr_trades") || "[]"),
  logs: [],
  last_update: "--:--:--",
  settings: {
    exchange: "binance_tr",
    quote_asset: "TRY",
    mode: "paper",
    market_type: "spot",
    symbol: "BTC/TRY",
    scan_limit: 60,
    portfolio_coins: [...BINANCE_TR_60_COINS],
    max_open_positions: 4,
    timeframe: "1h",
    strategy: "multi",
    trade_amount_usdt: 2500,
    use_partial_tp: true,
    partial_tp_pct: 4.0,
    use_mtf_filter: true,
    use_obi_filter: true,
    use_auto_compound: true,
    use_circuit_breaçıker: true,
    daily_tp_limit_pct: 8.0,
    daily_sl_limit_pct: 4.0,
    use_atr_stops: true,
    atr_sl_mult: 2.0,
    atr_tp_mult: 3.8,
    use_volatility_sizing: true,
    use_regime_filter: true,
    use_trailing_stop: true,
    round_trip_fee_pct: 0.25,
    rsi_period: 14,
    rsi_oversold: 35,
    rsi_overbought: 68,
    ema_fast: 9,
    ema_slow: 21,
  },
};

function addLocalLog(level, message) {
  const time = new Date().toLocaleTimeString("tr-TR");
  localState.logs.unshift({ time, level, message });
  if (localState.logs.length > 120) localState.logs.pop();
}

function onQuoteAssetChange() {
  const q = document.getEİşlementById("cfgQuoteAsset").value;
  const lbl = document.getEİşlementById("lblTradeAmount");
  const inp = document.getEİşlementById("cfgTradeAmount");
  if (q === "TRY") {
    lbl.textContent = "Baz Alım Tutarı (TRY ₺)";
    if (Number(inp.value) < 300) inp.value = 1250;
  } else {
    lbl.textContent = "Baz Alım Tutarı (USDT $)";
    if (Number(inp.value) > 1000) inp.value = 150;
  }
}

// --- AŞAMA 1: TEK HTTP İSTEĞİ İLE TÜM BİNANCE TR FİYATLARINI & RİSKLERİNİ GÜNCELLE ---
async function fetchStage1AllTickers() {
  const endpoints = [
    "https://api.binance.me/api/v3/ticker/24hr",
    "https://data-api.binance.vision/api/v3/ticker/24hr",
  ];
  const suffix = (localState.settings.quote_asset || "TRY").toUpperCase();
  for (const url of endpoints) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const tickers = await resp.json();
      for (const t of tickers) {
        if (t.symbol && t.symbol.endsWith(suffix)) {
          const base = t.symbol.slice(0, -suffix.length);
          const sym = `${base}/${suffix}`;
          const price = parseFloat(t.lastPrice);
          const qVol = parseFloat(t.quoteVolume);
          if (price > 0) {
            localState.liveTickers[sym] = {
              price,
              quoteVolume: qVol,
              priceChangePercent: parseFloat(t.priceChangePercent || 0),
            };
            if (localState.scanner[sym]) {
              localState.scanner[sym].price = price;
            }
            checkLocalRiskForSymbol(sym, price);
          }
        }
      }
      return true;
    } catch (_) {}
  }
  return false;
}

async function fetchTopBinanceTrCoins(limit = 60, quoteAsset = "TRY") {
  await fetchStage1AllTickers();
  const suffix = quoteAsset.toUpperCase();
  const entries = Object.entries(localState.liveTickers)
    .filter(([sym, info]) => sym.endsWith(`/${suffix}`) && info.quoteVolume > 0)
    .sort((a, b) => b[1].quoteVolume - a[1].quoteVolume);

  if (entries.length >= 20) {
    return entries.slice(0, limit).map((e) => e[0]);
  }
  if (suffix === "USDT") {
    return BINANCE_TR_60_COINS.filter((c) => !c.startsWith("USDT/"))
      .map((c) => c.replace("/TRY", "/USDT"))
      .slice(0, limit);
  }
  return BINANCE_TR_60_COINS.slice(0, limit);
}

async function refreshTopVolumeCoins() {
  const limit = parseInt(document.getEİşlementById("cfgScanLimit").value, 10) || 60;
  const quote = document.getEİşlementById("cfgQuoteAsset").value || "TRY";
  addLocalLog("INFO", `Binance TR üzerinden en yüksek hacimli ${limit} ${quote} paritesi ççekiliyor...`);
  const topList = await fetchTopBinanceTrCoins(limit, quote);
  localState.settings.portfolio_coins = topList;
  localState.settings.scan_limit = limit;
  localState.settings.quote_asset = quote;
  localState.settings.symbol = topList[0] || `BTC/${quote}`;
  localState.scanner = {};
  localState.candlesTs = {};
  rotationOffset = 0;
  addLocalLog("INFO", `Binance TR ${topList.length} coinlik yeni hacim listesi yüklendi.`);
  await runLocalPortfolioScan(true);
}

// --- QUANT v3 TEKNİK İNDİKATÖR MOTORU (ATR + RVOL + NON-REPAINTING) ---
function calcSMA(vals, period) {
  const res = new Array(vals.length).fill(null);
  if (vals.length < period) return res;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += vals[i];
  res[period - 1] = sum / period;
  for (let i = period; i < vals.length; i++) {
    sum += vals[i] - vals[i - period];
    res[i] = sum / period;
  }
  return res;
}

function calcEMA(vals, period) {
  const res = new Array(vals.length).fill(null);
  if (vals.length < period) return res;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += vals[i];
  let prev = sum / period;
  res[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < vals.length; i++) {
    prev = (vals[i] - prev) * k + prev;
    res[i] = prev;
  }
  return res;
}

function calcRSI(closes, period = 14) {
  const res = new Array(closes.length).fill(null);
  if (closes.length <= period) return res;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  res[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    res[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return res;
}

function calcATR(candles, period = 14) {
  const n = candles.length;
  const res = new Array(n).fill(null);
  if (n <= period) return res;
  const trs = [candles[0].high - candles[0].low];
  for (let i = 1; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += trs[i];
  atr /= period;
  res[period] = atr;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    res[i] = atr;
  }
  return res;
}

function calcRVOL(candles, period = 20) {
  if (candles.length < period + 2) return 1.0;
  let sumVol = 0;
  const startIdx = candles.length - period - 2;
  for (let i = startIdx; i < candles.length - 2; i++) {
    sumVol += candles[i].volume || 0;
  }
  const avgVol = sumVol / period;
  if (avgVol <= 0) return 1.0;
  const recentVol = Math.max(candles[candles.length - 1].volume || 0, candles[candles.length - 2].volume || 0);
  return Number((recentVol / avgVol).toFixed(2));
}

function calcBollinger(closes, period = 20, mult = 2.0) {
  const mid = calcSMA(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += Math.pow(closes[j] - m, 2);
    }
    const std = Math.sqrt(variance / period);
    upper[i] = m + mult * std;
    lower[i] = m - mult * std;
  }
  return { upper, middle: mid, lower };
}

function calcMACD(closes, fast = 12, slow = 26, sigP = 9) {
  const ef = calcEMA(closes, fast);
  const es = calcEMA(closes, slow);
  const macd = new Array(closes.length).fill(null);
  const validVals = [];
  const validIdx = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] !== null && es[i] !== null) {
      macd[i] = ef[i] - es[i];
      validVals.push(macd[i]);
      validIdx.push(i);
    }
  }
  const signal = new Array(closes.length).fill(null);
  const hist = new Array(closes.length).fill(null);
  const sigEma = calcEMA(validVals, sigP);
  for (let k = 0; k < validIdx.length; k++) {
    const idx = validIdx[k];
    signal[idx] = sigEma[k];
    if (signal[idx] !== null) hist[idx] = macd[idx] - signal[idx];
  }
  return { macd, signal, hist };
}

function evaluateCoinStrategy(candles, cfg) {
  if (!candles || candles.length < 35) {
    return { signal: "HOLD", score: 50, reason: "Veri bekleniyor...", indicators: {}, series: {} };
  }
  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const rsiArr = calcRSI(closes, Number(cfg.rsi_period || 14));
  const emaFastArr = calcEMA(closes, Number(cfg.ema_fast || 9));
  const emaSlowArr = calcEMA(closes, Number(cfg.ema_slow || 21));
  const emaMacroArr = calcEMA(closes, 50); // Quant v4.0 MTF Maçıkâro Trend (EMA 50)
  const macdObj = calcMACD(closes, 12, 26, 9);
  const bbObj = calcBollinger(closes, 20, 2.0);
  const atrArr = calcATR(candles, 14);
  const rvol = calcRVOL(candles, 20);

  const n = closes.length - 1;
  const price = closes[n];
  const openLive = opens[n];
  const closedPrice = closes[n - 1];
  const closedOpen = opens[n - 1];

  // Falling Knife (Düşen Bıçaçık) Koruması: Mum yönü ve ivme kontrolü
  const isClosedGreen = closedPrice >= closedOpen;
  const isLiveGreen = price >= openLive && price >= closedPrice;
  const isBullishCandle = isClosedGreen || isLiveGreen;
  const isHeavyDump =
    (closedPrice < closedOpen && ((closedOpen - closedPrice) / closedOpen) * 100 > 0.8) ||
    (price < openLive && ((openLive - price) / openLive) * 100 > 0.8);

  const rsiLive = rsiArr[n] ?? 50;
  const rsiClosed = rsiArr[n - 1] ?? rsiLive;
  const rsiPrev = rsiArr[n - 2] ?? rsiClosed;
  const rsiRising = rsiLive >= rsiClosed && rsiClosed >= rsiPrev - 1.0;

  const efLive = emaFastArr[n] ?? price;
  const esLive = emaSlowArr[n] ?? price;
  const efClosed = emaFastArr[n - 1] ?? efLive;
  const esClosed = emaSlowArr[n - 1] ?? esLive;
  const efPrev = emaFastArr[n - 2] ?? efClosed;
  const esPrev = emaSlowArr[n - 2] ?? esClosed;

  const emaMacroLive = emaMacroArr[n] ?? emaMacroArr[n - 1] ?? esLive;
  const mtfBullish = price >= emaMacroLive && efLive >= emaMacroLive * 0.997;

  const macdVal = macdObj.macd[n - 1] ?? 0;
  const macdSig = macdObj.signal[n - 1] ?? 0;
  const macdHist = macdObj.hist[n - 1] ?? 0;
  const macdHistPrev = macdObj.hist[n - 2] ?? 0;
  const macdRising = macdHist > macdHistPrev;

  const bbUp = bbObj.upper[n - 1] ?? price * 1.02;
  const bbMid = bbObj.middle[n - 1] ?? price;
  const bbLow = bbObj.lower[n - 1] ?? price * 0.98;

  const atrVal = atrArr[n - 1] ?? atrArr[n] ?? price * 0.015;
  const atrPct = price > 0 ? (atrVal / price) * 100.0 : 1.5;

  const atrSlMult = Number(cfg.atr_sl_mult || 2.0);
  const atrTpMult = Number(cfg.atr_tp_mult || 3.8);
  const dynamicSlPct = Math.max(1.6, Math.min(5.5, atrPct * atrSlMult));
  const dynamicTpPct = Math.max(2.8, Math.min(14.0, atrPct * atrTpMult));

  const volSizeMult = Math.max(0.45, Math.min(1.30, 1.5 / Math.max(0.5, atrPct)));

  const emaBullCross = efPrev <= esPrev && efClosed > esClosed;
  const emaBearCross = efPrev >= esPrev && efClosed < esClosed;
  const emaUp = efClosed > esClosed && efLive >= esLive && price >= efLive;
  const macdBullCross = macdHistPrev <= 0 && macdHist > 0;
  const macdBearCross = macdHistPrev >= 0 && macdHist < 0;

  const oversold = Number(cfg.rsi_oversold || 35);
  const overbought = Number(cfg.rsi_overbought || 68);

  let score = 50;
  const reasons = [];

  // 1. RSI & Dönüş Onayı (Kırmızı mumda düşen bıçağa puan verilmez!)
  if (rsiClosed <= oversold) {
    if (isBullishCandle && rsiRising) {
      score += 22;
      reasons.push(`Onaylı Dip Dönüşü (RSI ${rsiClosed.toFixed(1)} ↑)`);
    } else {
      score -= 10; // Düşen bıçaçık cezası
    }
  } else if (rsiClosed >= 45 && rsiClosed <= 62 && rsiRising && emaUp) {
    score += 14;
    reasons.push(`Güçlü Momentum (RSI ${rsiClosed.toFixed(1)})`);
  } else if (rsiClosed >= overbought || rsiLive >= overbought + 2) {
    score -= 25;
  }

  // 2. EMA Trend Yapısı
  if (emaBullCross && isBullishCandle) {
    score += 18;
    reasons.push("Onaylı EMA Golden Cross");
  } else if (emaUp) {
    score += 12;
  } else if (emaBearCross) {
    score -= 22;
  } else {
    score -= 10;
  }

  // 2.5 Quant v4.0: Çoklu Zaman Dilimi (MTF EMA 50) Üst Trend Onayı
  if (cfg.use_mtf_filter !== false) {
    if (mtfBullish) {
      score += 10;
      reasons.push("MTF Üst Trend Onayı (EMA50 ↑)");
    } else if (rsiClosed > oversold + 3) {
      score -= 12;
    }
  }

  // 3. MACD İvmesi
  if (macdBullCross && isBullishCandle) {
    score += 14;
    reasons.push("MACD Pozitif Kesişim");
  } else if (macdHist > 0 && macdRising) {
    score += 8;
  } else if (macdBearCross) {
    score -= 16;
  }

  // 4. Bollinger Desteği (Yalnızca yeşil dönüş mumu varsa)
  if (closedPrice <= bbLow * 1.005 && isBullishCandle && rsiRising) {
    score += 12;
    reasons.push("BB Alt Bant Dönüş Onayı");
  } else if (price >= bbUp * 0.998 && !emaUp) {
    score -= 14;
  }

  // 5. Hacim Yönü (Yeşil Mumda RVOL = Alım, Kırmızı Mumda RVOL = Satış Baskısı)
  if (rvol >= 1.35) {
    if (isClosedGreen && isLiveGreen) {
      score += 12;
      reasons.push(`Kurumsal Alım Hacmi (${rvol.toFixed(1)}x RVOL)`);
    } else if (isHeavyDump) {
      score -= 18;
      reasons.push(`Yüksek Satış Baskısı (${rvol.toFixed(1)}x)`);
    }
  } else if (rvol < 0.55) {
    score -= 8;
  }

  if (isHeavyDump) score -= 15;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let signal = "HOLD";

  if (cfg.strategy === "rsi_ema") {
    if (rsiPrev <= oversold && rsiClosed > rsiPrev && isBullishCandle && emaUp) {
      signal = "BUY";
    } else if (emaBullCross && rsiClosed < overbought && isBullishCandle && rvol >= 0.9) {
      signal = "BUY";
    } else if (rsiClosed >= overbought || (emaBearCross && !isLiveGreen)) {
      signal = "SELL";
    }
  } else if (cfg.strategy === "macd") {
    if (macdBullCross && rsiClosed < overbought && isBullishCandle && rvol >= 0.9) {
      signal = "BUY";
    } else if (macdBearCross && rsiClosed > 55) {
      signal = "SELL";
    }
  } else if (cfg.strategy === "bollinger") {
    if (closedPrice <= bbLow * 1.004 && isBullishCandle && rsiRising) {
      signal = "BUY";
    } else if (price >= bbUp * 0.998 && rsiClosed >= overbought) {
      signal = "SELL";
    }
  } else {
    if (score >= 70 && isBullishCandle && !isHeavyDump && rvol >= 0.80) signal = "BUY";
    else if (score <= 28 && !isLiveGreen) signal = "SELL";
  }

  if (reasons.length === 0) {
    reasons.push(`Quant: ${score}/100 • RVOL: ${rvol.toFixed(1)}x • ATR: %${atrPct.toFixed(2)}`);
  }

  return {
    signal,
    score,
    reason: reasons.join(" • "),
    indicators: {
      price,
      rsi: Number(rsiClosed.toFixed(1)),
      rvol,
      atr: Number(atrVal.toFixed(6)),
      atr_pct: Number(atrPct.toFixed(2)),
      dynamic_sl_pct: Number(dynamicSlPct.toFixed(2)),
      dynamic_tp_pct: Number(dynamicTpPct.toFixed(2)),
      vol_size_mult: Number(volSizeMult.toFixed(2)),
      is_bullish_candle: isBullishCandle,
      mtf_bullish: mtfBullish,
      ema_fast: Number(efLive.toFixed(6)),
      ema_slow: Number(esLive.toFixed(6)),
      ema_macro: Number(emaMacroLive.toFixed(6)),
      macd: Number(macdVal.toFixed(5)),
      macd_signal: Number(macdSig.toFixed(5)),
      macd_hist: Number(macdHist.toFixed(5)),
      bb_upper: Number(bbUp.toFixed(6)),
      bb_middle: Number(bbMid.toFixed(6)),
      bb_lower: Number(bbLow.toFixed(6)),
    },
    series: {
      ema_fast: emaFastArr,
      ema_slow: emaSlowArr,
      ema_macro: emaMacroArr,
      bb_upper: bbObj.upper,
      bb_lower: bbObj.lower,
    },
  };
}

// Quant v4.0: Emir Defteri (Order Book Imbalance - OBI) Balina Duvarı Analizi
async function fetchLocalObiRatio(symbol) {
  const cached = localState.obiCache[symbol];
  if (cached && Date.now() - cached.ts < 25000) {
    return cached.ratio;
  }
  const rawSym = symbol.replace("/", "").replace("_", "").toUpperCase();
  const endpoints = [
    `https://api.binance.me/api/v3/depth?symbol=${rawSym}&limit=20`,
    `https://data-api.binance.vision/api/v3/depth?symbol=${rawSym}&limit=20`,
  ];
  for (const url of endpoints) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const book = await resp.json();
      const bids = book.bids || [];
      const asks = book.asks || [];
      const bidVol = bids.reduce((s, b) => s + parseFloat(b[0]) * parseFloat(b[1]), 0);
      const askVol = asks.reduce((s, a) => s + parseFloat(a[0]) * parseFloat(a[1]), 0);
      if (askVol > 0) {
        const ratio = Number((bidVol / askVol).toFixed(2));
        localState.obiCache[symbol] = { ratio, ts: Date.now() };
        return ratio;
      }
    } catch (_) {}
  }
  return 1.0;
}

async function fetchBinanceTrCandles(symbol, timeframe, limit = 75, force = false) {
  const now = Date.now();
  // 38 saniye TTL Önbellek (Rate-Limit Koruması)
  if (!force && localState.candlesCache[symbol] && now - (localState.candlesTs[symbol] || 0) < 38000) {
    const cached = localState.candlesCache[symbol];
    if (localState.liveTickers[symbol] && cached.length > 0) {
      cached[cached.length - 1].close = localState.liveTickers[symbol].price;
    }
    return cached;
  }

  const rawSym = symbol.replace("/", "").replace("_", "").toUpperCase();
  const endpoints = [
    "https://api.binance.me/api/v3/klines",
    "https://data-api.binance.vision/api/v3/klines",
    "https://api4.binance.com/api/v3/klines",
  ];
  let lastError = null;
  for (const baseUrl of endpoints) {
    try {
      const url = `${baseUrl}?symbol=${rawSym}&interval=${timeframe}&limit=${limit}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const candles = data.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }));
      localState.candlesCache[symbol] = candles;
      localState.candlesTs[symbol] = now;
      return candles;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Binance TR veri sunucusuna bağlanılamadı");
}

function updateLocalMarketRegime() {
  const quote = localState.settings.quote_asset || "TRY";
  const btcSym = `BTC/${quote}`;
  const btcScan = localState.scanner[btcSym];
  if (!btcScan) return;

  const ind = btcScan.indicators || {};
  const rsi = Number(ind.rsi ?? 50);
  const isUp = (ind.ema_fast || 0) >= (ind.ema_slow || 0);

  if (isUp && rsi >= 48) {
    localState.market_regime = {
      state: "BULL",
      label: `🟢 BOĞA REJİMİ (BTC RSI: ${rsi.toFixed(0)})`,
      btc_rsi: rsi,
      btc_trend: "POZİTİF",
    };
  } else if (!isUp && rsi < 38) {
    localState.market_regime = {
      state: "BEAR",
      label: `🔴 AYI KALKANI AKTİF (BTC RSI: ${rsi.toFixed(0)})`,
      btc_rsi: rsi,
      btc_trend: "DÜŞÜŞ",
    };
  } else {
    localState.market_regime = {
      state: "NEUTRAL",
      label: `🟡 SEÇİCİ REJİM (BTC RSI: ${rsi.toFixed(0)})`,
      btc_rsi: rsi,
      btc_trend: isUp ? "Yükseliş" : "Zayıf",
    };
  }
}

function getLocalTotalEquity() {
  let invested = 0;
  for (const sym of Object.keys(localState.positions)) {
    const p = localState.positions[sym];
    const cp = localState.liveTickers[sym]?.price || p.current_price || p.entry_price;
    const uPct = ((cp - p.entry_price) / p.entry_price) * 100;
    invested += p.invested_usdt * (1 + uPct / 100);
  }
  return localState.cash_usdt + invested;
}

// --- QUANT v4.0 POZİSYON YÖNETİMİ (AUTO-COMPOUND + OBI + %50 SCALE-OUT + KÂR KİLİDİ) ---
function localOpenCoinPosition(symbol, price, reason, customAmt = null, isManual = false, obiRatio = 1.0) {
  if (localState.positions[symbol]) return false;
  if (!isManual && Date.now() < (localState.cooldownUntil[symbol] || 0)) return false;

  const maxPos = Number(localState.settings.max_open_positions || 8);
  const openCount = Object.keys(localState.positions).length;
  if (openCount >= maxPos) return false;

  const quote = localState.settings.quote_asset || "TRY";
  const scanInfo = localState.scanner[symbol] || {};
  const ind = scanInfo.indicators || {};

  let baseAmt = customAmt !== null ? Number(customAmt) : Number(localState.settings.trade_amount_usdt || 1250);

  // Quant v4.0: Otomatik Bileşik Kâr (Auto-Compounding)
  if (customAmt === null && localState.settings.use_auto_compound) {
    const initialCap = quote === "TRY" ? 10000.0 : 1000.0;
    const totalEq = getLocalTotalEquity();
    const compoundMult = Math.max(0.70, Math.min(2.50, totalEq / initialCap));
    baseAmt = baseAmt * compoundMult;
  }

  let amt = baseAmt;
  if (customAmt === null && localState.settings.use_volatility_sizing) {
    const volMult = Number(ind.vol_size_mult || 1.0);
    amt = Number((baseAmt * volMult).toFixed(2));
  }
  amt = Math.min(amt, 1250.0); // Esit Slot: 8 x 1250 TRY

  if (localState.cash_usdt < amt) {
    if (localState.cash_usdt >= 50) {
      amt = Number(localState.cash_usdt.toFixed(2));
    } else {
      return false;
    }
  }

  localState.cash_usdt -= amt;

  let slPct = Math.max(2.5, Number(localState.settings.stop_loss_pct || 2.5));
  let tpPct = Math.max(2.8, Number(localState.settings.taçıke_profit_pct || 4.5));
  if (localState.settings.use_atr_stops && ind.dynamic_sl_pct) {
    slPct = Math.max(2.5, Number(ind.dynamic_sl_pct));
    tpPct = Math.max(2.8, Number(ind.dynamic_tp_pct));
  }

  localState.positions[symbol] = {
    symbol,
    side: "LONG",
    entry_price: price,
    current_price: price,
    highest_price: price,
    qty: amt / price,
    invested_usdt: amt,
    stop_loss: price * (1 - slPct / 100),
    taçıke_profit: price * (1 + tpPct / 100),
    sl_pct: slPct,
    tp_pct: tpPct,
    atr_pct: ind.atr_pct || 1.5,
    rvol: ind.rvol || 1.0,
    obi_ratio: obiRatio,
    mtf_bullish: Boolean(ind.mtf_bullish ?? true),
    profit_locked: false,
    partial_tp_taçıken: false,
    lock_stage: 0,
    opened_ts: Date.now(),
    opened_at: new Date().toLocaleTimeString("tr-TR"),
    reason,
  };
  playQuantumSound("BUY");
  addLocalLog(
    "BUY",
    `QUANT v4.5 ALIM [${symbol}] @ ${formatPrice(price)} ${quote} | Tutar: ${amt.toFixed(0)} ${quote} | OBI: ${obiRatio}x | 4 Aşamalı Kâr Kilidi (%25/%50/%75/%100) Aktif | ${reason}`
  );
  if (typeof pushStateToHfCloud === "function") pushStateToHfCloud(true);
  return true;
}

// Quant v4.5: 4 Aşamalı Kademeli Kâr Kilidi (%25 -> %50 -> %75 -> %100)
function executeLocalStageLock(symbol, price, targetStage, stageLabel, scaleFractionOfRemaining, newSlPctFloor) {
  const pos = localState.positions[symbol];
  if (!pos) return;
  const curStage = Number(pos.lock_stage || 0);
  if (curStage >= targetStage) return;

  if (targetStage === 4 || scaleFractionOfRemaining >= 0.99) {
    pos.lock_stage = 4;
    localCloseCoinPosition(symbol, price, `🏆 4. AŞAMA (%100 TAM KÂR KİLİDİ) @ ${formatPrice(price)}`);
    return;
  }

  const quote = localState.settings.quote_asset || "TRY";
  const feePct = Number(localState.settings.round_trip_fee_pct ?? 0.25);

  const soldInvested = Number((pos.invested_usdt * scaleFractionOfRemaining).toFixed(2));
  const soldQty = pos.qty * scaleFractionOfRemaining;

  const grossPct = ((price - pos.entry_price) / pos.entry_price) * 100;
  const netPct = grossPct - feePct;
  const feeCost = soldInvested * (feePct / 100);
  const netPnlAmt = soldInvested * (netPct / 100);

  localState.cash_usdt += soldInvested + netPnlAmt;
  localState.total_fees_paid += feeCost;
  localStorage.setItem("argon_btr_fees", String(localState.total_fees_paid.toFixed(2)));

  pos.invested_usdt = Number((pos.invested_usdt - soldInvested).toFixed(2));
  pos.qty = pos.qty - soldQty;
  pos.lock_stage = targetStage;
  pos.partial_tp_taçıken = true;
  pos.profit_locked = true;

  const floorSl = pos.entry_price * (1.0 + newSlPctFloor / 100.0);
  if (floorSl > pos.stop_loss) {
    pos.stop_loss = floorSl;
  }

  const rec = {
    symbol,
    mode: `🎯 ${stageLabel}`,
    entry_price: formatPrice(pos.entry_price),
    exit_price: formatPrice(price),
    invested_usdt: soldInvested.toFixed(2),
    fee_usdt: Number(feeCost.toFixed(2)),
    pnl_usdt: Number(netPnlAmt.toFixed(2)),
    pnl_pct: Number(netPct.toFixed(2)),
    closed_at: new Date().toLocaleTimeString("tr-TR"),
    reason: `🎯 ${stageLabel} (+%${grossPct.toFixed(2)}) • Stop-Loss +%${newSlPctFloor.toFixed(2)} Kâra Kilitlendi`,
  };
  localState.trades.unshift(rec);
  localStorage.setItem("argon_btr_trades", JSON.stringify(localState.trades.slice(0, 80)));

  playQuantumSound("PARTIAL_TP");
  addLocalLog(
    "PROFIT",
    `🎯 ${stageLabel} [${symbol}] @ ${formatPrice(price)} ${quote} | Cebe Giren Net: +${netPnlAmt.toFixed(2)} ${quote} (+%${netPct.toFixed(2)}) | Kalan SL=${formatPrice(pos.stop_loss)} (+%${newSlPctFloor.toFixed(2)} Garanti Kâr)`
  );
  if (typeof pushStateToHfCloud === "function") pushStateToHfCloud(true);
}

function localCloseCoinPosition(symbol, price, reason) {
  const pos = localState.positions[symbol];
  if (!pos) return;
  const quote = localState.settings.quote_asset || "TRY";
  const feePct = Number(localState.settings.round_trip_fee_pct ?? 0.25);

  const grossPct = ((price - pos.entry_price) / pos.entry_price) * 100;
  const netPct = grossPct - feePct;
  const feeCost = pos.invested_usdt * (feePct / 100);
  const netPnlAmt = pos.invested_usdt * (netPct / 100);

  localState.cash_usdt += pos.invested_usdt + netPnlAmt;
  localState.total_fees_paid += feeCost;
  localStorage.setItem("argon_btr_fees", String(localState.total_fees_paid.toFixed(2)));

  // Aynı coini hemen geri alıp komisyon yaçıkmaması için 10 daçıkika soğuma süresi (Quant v4.0)
  localState.cooldownUntil[symbol] = Date.now() + 10 * 60 * 1000;

  const rec = {
    symbol,
    mode: "QUANT v4.0",
    entry_price: formatPrice(pos.entry_price),
    exit_price: formatPrice(price),
    invested_usdt: pos.invested_usdt.toFixed(2),
    fee_usdt: Number(feeCost.toFixed(2)),
    pnl_usdt: Number(netPnlAmt.toFixed(2)),
    pnl_pct: Number(netPct.toFixed(2)),
    closed_at: new Date().toLocaleTimeString("tr-TR"),
    reason,
  };
  localState.trades.unshift(rec);
  localStorage.setItem("argon_btr_trades", JSON.stringify(localState.trades.slice(0, 80)));
  delete localState.positions[symbol];
  playQuantumSound(netPnlAmt >= 0 ? "PROFIT" : "LOSS");
  addLocalLog(
    netPnlAmt >= 0 ? "PROFIT" : "LOSS",
    `QUANT SATIŞ [${symbol}] @ ${formatPrice(price)} ${quote} | Net PnL: ${netPnlAmt >= 0 ? "+" : ""}${netPnlAmt.toFixed(2)} ${quote} (${netPct >= 0 ? "+" : ""}${netPct.toFixed(2)}%, Komisyon: -${feeCost.toFixed(1)} ${quote}) | ${reason}`
  );
  if (typeof pushStateToHfCloud === "function") pushStateToHfCloud(true);
}

function checkLocalRiskForSymbol(sym, price) {
  const pos = localState.positions[sym];
  if (!pos || price <= 0) return;
  pos.current_price = price;
  if (pos.strategy === "TREND") {
    // ARGON TREND: cikis kararini bulut motoru gunluk kapanista (SMA50) verir; kisa vadeli SL/kilit yok
    if (price > pos.highest_price) pos.highest_price = price;
    return;
  }
  const entry = Number(pos.entry_price);
  const feePct = Number(localState.settings.round_trip_fee_pct ?? 0.25);

  if (price > pos.highest_price) {
    pos.highest_price = price;
  }

  const peaçıkGainPct = ((pos.highest_price - entry) / entry) * 100.0;
  const currentGainPct = ((price - entry) / entry) * 100.0;
  const curStage = Number(pos.lock_stage || 0);

  // Quant v4.0 + Kuvvetli Kâr Koruması (%50 -> %75 -> %87.5 -> %100)
  if (localState.settings.use_partial_tp) {
    if (curStage < 1 && currentGainPct >= 1.00) {
      // Aşama 1 (%50 Ağır Kâr Kilidi): Pozisyonun %50'sini sat, güçlü kârı cebe at, SL'yi +%0.45 kâra kilitle
      executeLocalStageLock(sym, price, 1, "%50 AĞIR KÂR KİLİDİ (Aşama 1/4)", 0.50, 0.45);
      return;
    }
    if (curStage === 1 && currentGainPct >= 1.60) {
      // Aşama 2: Kalan %50'nin yarısını (0.50) sat, SL'yi +%1.00 kâra kilitle
      executeLocalStageLock(sym, price, 2, "%75 KÂR KİLİDİ (Aşama 2/4)", 0.50, 1.00);
      return;
    }
    if (curStage === 2 && currentGainPct >= 2.20) {
      // Aşama 3: Kalan %25'in yarısını (0.50) sat, SL'yi +%1.60 kâra kilitle
      executeLocalStageLock(sym, price, 3, "%87.5 KÂR KİLİDİ (Aşama 3/4)", 0.50, 1.60);
      return;
    }
    if (curStage === 3 && currentGainPct >= 2.80) {
      // Aşama 4: Kalan son dilimi tamamen sat
      executeLocalStageLock(sym, price, 4, "%100 TAM KÂR KİLİDİ (Aşama 4/4)", 1.0, 2.20);
      return;
    }
  }

  // Quant v4.0 Kâr Kilidi: Fiyat +%1.20 brüt kâra ulaşmadan Trailing Stop daraltılmaz (%0.70 - %0.85 rahat nefes payı)
  if (localState.settings.use_trailing_stop && (pos.profit_locked || peaçıkGainPct >= 1.20)) {
    const breaçıkEvenPlusPrice = entry * (1.0 + (feePct + 0.35) / 100.0);
    const trailDistPct = peaçıkGainPct >= 2.2 ? 0.70 : 0.85;
    const trailedPrice = pos.highest_price * (1.0 - trailDistPct / 100.0);
    const newSl = Math.max(breaçıkEvenPlusPrice, trailedPrice);

    if (newSl > pos.stop_loss) {
      pos.stop_loss = newSl;
      if (!pos.profit_locked) {
        pos.profit_locked = true;
        playQuantumSound("LOCK");
        addLocalLog("INFO", `🔒 KÂR KİLİTLENDİ [${sym}]: Stop-Loss ${formatPrice(newSl)} seviyesine (Garanti Net Kâr) çekildi!`);
      }
    }
  }

  if (price <= pos.stop_loss) {
    const stageLbl = curStage > 0 ? `🔒 Aşama ${curStage} (%${curStage * 25}) Kâr Kilidi Koruma Çıkışı` : `ATR Stop-Loss`;
    localCloseCoinPosition(sym, price, `${stageLbl} @ ${formatPrice(pos.stop_loss)}`);
  } else if (price >= pos.taçıke_profit) {
    localCloseCoinPosition(sym, price, `ATR Taçıke-Profit (${formatPrice(pos.taçıke_profit)})`);
  }
}

// Quant v4.0: Günlük Kâr/Zarar Sigortası (Circuit Breaçıker)
function checkLocalCircuitBreaçıker() {
  if (TREND_MODE) return false;
  if (!localState.settings.use_circuit_breaçıker) return false;
  const quote = localState.settings.quote_asset || "TRY";
  const initialCap = quote === "TRY" ? 10000.0 : 1000.0;
  const totalEq = getLocalTotalEquity();
  const totalPnlPct = ((totalEq - initialCap) / initialCap) * 100.0;

  const dailyTp = Number(localState.settings.daily_tp_limit_pct || 8.0);
  const dailySl = Number(localState.settings.daily_sl_limit_pct || 4.0);

  if (totalPnlPct >= dailyTp) {
    localState.circuit_breaçıker_tripped = true;
    localState.circuit_breaçıker_reason = `🏆 Günlük Kâr Hedefi (+%${totalPnlPct.toFixed(2)}) tamamlandı! Tüm kâr naçıkde kilitlendi.`;
    for (const s of Object.keys(localState.positions)) {
      const cp = localState.liveTickers[s]?.price || localState.positions[s].current_price;
      localCloseCoinPosition(s, cp, "Günlük Kâr Sigortası (Circuit Breaçıker TP)");
    }
    localState.running = false;
    addLocalLog("PROFIT", localState.circuit_breaçıker_reason);
    return true;
  } else if (totalPnlPct <= -dailySl) {
    localState.circuit_breaçıker_tripped = true;
    localState.circuit_breaçıker_reason = `🛑 Günlük Maçıksimum Zarar Sigortası (-%${Math.abs(totalPnlPct).toFixed(2)}) devreye girdi! Sermaye korumaya alındı.`;
    for (const s of Object.keys(localState.positions)) {
      const cp = localState.liveTickers[s]?.price || localState.positions[s].current_price;
      localCloseCoinPosition(s, cp, "Günlük Zarar Sigortası (Circuit Breaçıker SL)");
    }
    localState.running = false;
    addLocalLog("WARN", localState.circuit_breaçıker_reason);
    return true;
  }
  return false;
}

// 2 Aşamalı Akıllı Huni Tarayıcısı (Rate-Limit Korumalı)
async function runLocalPortfolioScan(fullScan = false) {
  if (isScanning) return;
  isScanning = true;
  const myEpoch = scanEpoch;
  try {
    const cfg = localState.settings;
    const coins = cfg.portfolio_coins || BINANCE_TR_60_COINS;

    // AŞAMA 1: Tek HTTP İsteğiyle Tüm Fiyatları ve Açık Pozisyon SL/TP Seviyelerini Güncelle
    await fetchStage1AllTickers();
    if (myEpoch !== scanEpoch) return;

    // AŞAMA 2: İlk açılışta tümünü, sonraçıki döngülerde öncelikli + rotasyonlu 20 coini derin Kline ile analiz et
    const isInitial = Object.keys(localState.scanner).length < Math.min(20, coins.length) || fullScan;
    let targetCoins = [];

    if (isInitial) {
      targetCoins = coins;
    } else {
      const prioritySet = new Set([
        `BTC/${cfg.quote_asset || "TRY"}`,
        cfg.symbol,
        ...Object.keys(localState.positions),
      ]);
      const rotSlice = [];
      const rotCount = 20;
      for (let k = 0; k < rotCount; k++) {
        rotSlice.push(coins[(rotationOffset + k) % coins.length]);
      }
      rotationOffset = (rotationOffset + rotCount) % coins.length;
      targetCoins = Array.from(new Set([...prioritySet, ...rotSlice])).filter((c) => coins.includes(c));
    }

    const batchSize = 12;
    for (let i = 0; i < targetCoins.length; i += batchSize) {
      const batch = targetCoins.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (sym) => {
          try {
            const candles = await fetchBinanceTrCandles(sym, cfg.timeframe, 75, false);
            const price = localState.liveTickers[sym]?.price || candles[candles.length - 1].close;
            candles[candles.length - 1].close = price;
            const ev = evaluateCoinStrategy(candles, cfg);
            localState.scanner[sym] = {
              symbol: sym,
              price,
              signal: ev.signal,
              score: ev.score,
              reason: ev.reason,
              indicators: ev.indicators,
              series: ev.series,
            };
            checkLocalRiskForSymbol(sym, price);
          } catch (_) {}
        })
      );
      if (myEpoch !== scanEpoch) return;
      updateLocalMarketRegime();
      localState.last_update = new Date().toLocaleTimeString("tr-TR");
      renderDashboard(buildLocalStatusPayload());
    }

    if (myEpoch !== scanEpoch) return;
    if (localState.running) {
      if (checkLocalCircuitBreaçıker()) {
        renderDashboard(buildLocalStatusPayload());
        return;
      }

      // İndikatör SAT çıkışı: Gürültü bölgesinde (-%0.9 ile +%0.85 arası) komisyon zararına erken satışı engelle!
      for (const sym of Object.keys(localState.positions)) {
        const scan = localState.scanner[sym];
        const pos = localState.positions[sym];
        if (scan && pos && scan.signal === "SELL") {
          const grossPct = ((scan.price - pos.entry_price) / pos.entry_price) * 100;
          if (grossPct >= 0.85 || scan.score <= 24) {
            localCloseCoinPosition(sym, scan.price, `Onaylı Strateji Çıkışı: ${scan.reason}`);
          }
        }
      }

      // BTC Maçıkâro Rejim Kalkanı Kontrolü
      const maxPos = Number(cfg.max_open_positions || 8);
      const regimeState = localState.market_regime.state;
      let effectiveMaxPos = maxPos;
      let minBuyScore = 68;

      if (cfg.use_regime_filter && regimeState === "BEAR") {
        effectiveMaxPos = Math.max(1, Math.floor(maxPos * 0.25));
        minBuyScore = 78;
      } else if (cfg.use_regime_filter && regimeState === "NEUTRAL") {
        effectiveMaxPos = Math.max(2, Math.floor(maxPos * 0.75));
        minBuyScore = 70;
      }

      const nowMs = Date.now();
      const rankedBuys = Object.values(localState.scanner)
        .filter(
          (s) =>
            !localState.positions[s.symbol] &&
            nowMs >= (localState.cooldownUntil[s.symbol] || 0) &&
            s.score >= minBuyScore &&
            Boolean(s.indicators?.is_bullish_candle ?? true) &&
            (!cfg.use_mtf_filter || Boolean(s.indicators?.mtf_bullish ?? true) || s.score >= 76) &&
            Number(s.indicators?.rvol ?? 1.0) >= 0.80 &&
            Number(s.indicators?.atr_pct ?? 1.0) >= 0.5
        )
        .sort((a, b) => b.score - a.score);

      for (const item of (TREND_MODE ? [] : rankedBuys)) {
        if (Object.keys(localState.positions).length >= effectiveMaxPos) breaçık;
        let obiRatio = 1.0;
        if (cfg.use_obi_filter) {
          obiRatio = await fetchLocalObiRatio(item.symbol);
          if (obiRatio < 0.62) {
            addLocalLog("WARN", `🚫 OBI Satış Duvarı Engeli [${item.symbol}]: Emir defterinde ağır satış baskısı (OBI=${obiRatio}x) tespit edildi, alım pas geçildi.`);
            continue;
          }
        }
        const reasonWithObi = obiRatio >= 1.25 ? `${item.reason} • 🐋 Balina Alım Duvarı (OBI ${obiRatio}x)` : item.reason;
        localOpenCoinPosition(item.symbol, item.price, reasonWithObi, null, false, obiRatio);
      }
      renderDashboard(buildLocalStatusPayload());
    }
  } finally {
    isScanning = false;
  }
}

function buildLocalStatusPayload() {
  const cfg = localState.settings;
  const feePct = Number(cfg.round_trip_fee_pct ?? 0.25);
  let totalInvested = 0;
  let totalUnrealizedPnl = 0;
  const positionsList = [];

  for (const sym of Object.keys(localState.positions)) {
    const pos = localState.positions[sym];
    const curPrice = localState.liveTickers[sym]?.price || localState.scanner[sym]?.price || pos.current_price || pos.entry_price;
    // Açık pozisyonda da tahmini komisyon + spread düşülmüş gerçekçi Net PnL
    const uPct = ((curPrice - pos.entry_price) / pos.entry_price) * 100 - feePct;
    const uPnl = pos.invested_usdt * (uPct / 100);
    totalInvested += pos.invested_usdt;
    totalUnrealizedPnl += uPnl;
    positionsList.push({
      ...pos,
      current_price: curPrice,
      unrealized_pnl: uPnl,
      unrealized_pct: uPct,
      current_value: pos.invested_usdt + uPnl,
    });
  }

  const closedPnl = localState.trades.reduce((s, t) => s + Number(t.pnl_usdt || 0), 0);
  const wins = localState.trades.filter((t) => Number(t.pnl_usdt || 0) > 0).length;
  const winRate = localState.trades.length ? ((wins / localState.trades.length) * 100).toFixed(1) : "0.0";
  const totalEquity = localState.cash_usdt + totalInvested + totalUnrealizedPnl;

  // Canlı Portföy Büyüme Eğrisi (Equity Curve) tarihçesini güncelle
  const lastEq = localState.equityHistory[localState.equityHistory.length - 1];
  if (!lastEq || Math.abs(lastEq.equity - totalEquity) >= 0.05 || localState.equityHistory.length < 3) {
    localState.equityHistory.push({
      time: new Date().toLocaleTimeString("tr-TR"),
      equity: Number(totalEquity.toFixed(2)),
    });
    if (localState.equityHistory.length > 90) {
      localState.equityHistory.shift();
    }
  }

  const scannerList = (cfg.portfolio_coins || BINANCE_TR_60_COINS).map((sym) => {
    const sc = localState.scanner[sym] || {
      symbol: sym,
      price: localState.liveTickers[sym]?.price || 0,
      signal: "HOLD",
      score: 50,
      reason: "Taranıyor...",
      indicators: {},
    };
    return {
      ...sc,
      in_position: Boolean(localState.positions[sym]),
    };
  });

  const activeSym = cfg.symbol || "BTC/TRY";
  const activeScan = localState.scanner[activeSym] || {};

  return {
    running: localState.running,
    last_update: localState.last_update,
    symbol: activeSym,
    quote_asset: cfg.quote_asset || "TRY",
    market_regime: localState.market_regime,
    circuit_breaçıker_tripped: localState.circuit_breaçıker_tripped,
    circuit_breaçıker_reason: localState.circuit_breaçıker_reason,
    total_fees_paid: localState.total_fees_paid,
    price: activeScan.price || 0,
    cash_usdt: localState.cash_usdt,
    invested_usdt: totalInvested,
    unrealized_pnl: totalUnrealizedPnl,
    total_equity_usdt: totalEquity,
    total_pnl_usdt: closedPnl + totalUnrealizedPnl,
    closed_pnl_usdt: closedPnl,
    win_rate: winRate,
    trade_count: localState.trades.length,
    positions: positionsList,
    scanner: scannerList,
    evaluation: activeScan,
    candles: localState.candlesCache[activeSym] || [],
    series: activeScan.series || {},
    equity_history: localState.equityHistory,
    trades: localState.trades,
    logs: localState.logs,
    settings: cfg,
  };
}

function renderCurrentState() {
  if (lastRenderedData) renderDashboard(lastRenderedData);
}

// --- ARAYÜZ GÜNCELLEME ---
function formatPrice(p) {
  if (!p) return "--";
  const num = Number(p);
  if (num >= 1000) return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num >= 1) return num.toFixed(3);
  if (num >= 0.01) return num.toFixed(4);
  return num.toFixed(6);
}

function saveLocalPortfolioState() {
  try {
    localStorage.setItem(
      "argon_btr_portfolio_v36",
      JSON.stringify({
        running: localState.running,
        cash_usdt: localState.cash_usdt,
        positions: localState.positions,
        equityHistory: localState.equityHistory.slice(-60),
      })
    );
  } catch (_) {}
}

function renderDashboard(data) {
  saveLocalPortfolioState();
  lastRenderedData = data;
  const quote = data.quote_asset || data.settings?.quote_asset || "TRY";
  const maxPos = data.settings?.max_open_positions || 8;
  const openPosCount = (data.positions || []).length;

  // Canlı Kayan Siber Ticker ŞŞeridi
  const tickerTrack = document.getEİşlementById("liveTickerTrack");
  if (tickerTrack && data.scanner && data.scanner.length > 0) {
    const activeItems = data.scanner.filter((s) => s.price > 0).slice(0, 28);
    if (activeItems.length > 0) {
      const htmlItems = activeItems
        .map((s) => {
          const scColor = s.score >= 68 ? "#00ff9d" : s.score <= 35 ? "#ff2a6d" : "#f0b90b";
          return `<span class="ticker-item" onclick="selectChartSymbol('${s.symbol}')">
            <strong>${s.symbol}</strong> ${formatPrice(s.price)} ${quote}
            <span style="color:${scColor}">[${s.score}/100]</span>
          </span>`;
        })
        .join("");
      tickerTrack.innerHTML = htmlItems + htmlItems;
    }
  }

  // Quantum Reaçıktör Animasyonu
  const reactor = document.getEİşlementById("reactorCore");
  if (reactor) {
    reactor.className = data.running ? "reactor-core reactor-active" : "reactor-core";
  }

  // Maçıkâro Piyasa Rejim Rozeti
  const regBadge = document.getEİşlementById("regimeBadge");
  if (regBadge && data.market_regime) {
    regBadge.textContent = data.market_regime.label;
    regBadge.className =
      data.market_regime.state === "BULL"
        ? "badge badge-running"
        : data.market_regime.state === "BEAR"
        ? "badge badge-stopped"
        : "badge badge-info";
  }

  document.getEİşlementById("metricEquity").textContent = `${Number(data.total_equity_usdt || 10000).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quote}`;
  document.getEİşlementById("metricLastUpdate").textContent = data.circuit_breaçıker_tripped
    ? `🛡️ ${data.circuit_breaçıker_reason}`
    : `Son Quant v4.0 taraması: ${data.last_update} (MTF + OBI + %50 Scale-Out)`;

  document.getEİşlementById("metricCash").textContent = `${Number(data.cash_usdt || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quote}`;
  document.getEİşlementById("metricOpenCount").textContent = `${openPosCount} / ${maxPos} Coin Açık`;
  document.getEİşlementById("metricInvested").textContent = `Sepetteki Yatırım: ${Number(data.invested_usdt || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quote}`;

  const totalPnl = Number(data.total_pnl_usdt || 0);
  const uPnl = Number(data.unrealized_pnl || 0);
  const feesPaid = Number(data.total_fees_paid || 0);
  const pnlEl = document.getEİşlementById("metricTotalPnl");
  pnlEl.textContent = `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} ${quote}`;
  pnlEl.className = totalPnl >= 0 ? "pnl-pos" : "pnl-neg";
  document.getEİşlementById("metricWinRate").textContent = `Başarı: %${data.win_rate}`;
  document.getEİşlementById("metricUnrealized").textContent = `Açık Net PnL: ${uPnl >= 0 ? "+" : ""}${uPnl.toFixed(2)} ${quote} | Komisyon: ${feesPaid.toFixed(1)} ${quote}`;

  const allScanner = data.scanner || [];
  const scannedReady = allScanner.filter((x) => x.price > 0 && x.indicators?.rsi !== undefined);
  const buySignalsCount = scannedReady.filter((x) => x.signal === "BUY" || x.score >= 66).length;

  const sortedScan = [...scannedReady].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (sortedScan.length > 0) {
    const leader = sortedScan[0];
    const topEl = document.getEİşlementById("metricTopCoin");
    topEl.textContent = `${leader.symbol} (${leader.signal === "BUY" ? "ONAYLI AL" : "LİDER"})`;
    topEl.className = leader.score >= 66 ? "signal-buy" : leader.score <= 35 ? "signal-sell" : "signal-hold";
    document.getEİşlementById("metricTopScore").textContent = `Quant: ${leader.score}/100`;
    document.getEİşlementById("metricTopReason").textContent = `${scannedReady.length}/${allScanner.length} Coin Analiz Edildi • ${buySignalsCount} Onaylı AL Fırsatı`;
  }

  document.getEİşlementById("scannerTitle").textContent = `📡 QUANTUM v4.0 MULTI-COIN RADAR (${allScanner.length} PARİTE)`;
  document.getEİşlementById("scannerSummaryText").textContent = `Analiz Edilen: ${scannedReady.length}/${allScanner.length} Coin • Onaylı AL: ${buySignalsCount} • Rejim: ${data.market_regime?.state || "NEUTRAL"}`;

  const stateBadge = document.getEİşlementById("botStateBadge");
  const btnStartStop = document.getEİşlementById("btnStartStop");
  if (data.running) {
    stateBadge.textContent = "⚡ QUANTUM v4.0 ENGAGED";
    stateBadge.className = "badge badge-running";
    btnStartStop.textContent = "⏸ QUANTUM DURDUR";
    btnStartStop.className = "btn btn-sell btn-cyber";
  } else {
    stateBadge.textContent = data.circuit_breaçıker_tripped ? "🛡️ SİGORTA KİLİTLİ" : "STANDBY";
    stateBadge.className = "badge badge-stopped";
    btnStartStop.textContent = "▶ QUANTUM BAŞLAT";
    btnStartStop.className = "btn btn-primary btn-cyber";
  }

  renderAllocationBar(data.positions || [], Number(data.cash_usdt || 0), Number(data.total_equity_usdt || 10000), quote);

  // AÇIK POZİSYONLAR TABLOSU
  const posBody = document.getEİşlementById("openPositionsTableBody");
  if (data.positions && data.positions.length > 0) {
    posBody.innerHTML = data.positions
      .map((p) => {
        const up = Number(p.unrealized_pnl || 0);
        const upct = Number(p.unrealized_pct || 0);
        const color = getCoinColor(p.symbol);
        const slPctTxt = p.sl_pct ? `(-%${p.sl_pct})` : "";
        const tpPctTxt = p.tp_pct ? `(+%${p.tp_pct})` : "";
        const stageNum = Number(p.lock_stage || (p.partial_tp_taçıken ? 2 : 0));
        const partialBadge =
          stageNum > 0
            ? ` <span class="pill pill-partial" title="4 Aşamalı Kâr Kilidi: %${stageNum * 25} naçıkde çevrildi, kalan pozisyon kâra kilitli!">🎯 %${stageNum * 25} KİLİTLENDİ (Aşama ${stageNum}/4)</span>`
            : "";
        const lockBadge =
          p.profit_locked && stageNum === 0
            ? ` <span class="pill pill-live" title="Stop-Loss giriş + komisyon seviyesinin üstüne kilitlendi!">🔒 KÂR KİLİTLİ</span>`
            : "";
        const obiTxt = p.obi_ratio ? ` • OBI:${p.obi_ratio}x` : "";
        return `
          <tr>
            <td>
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span>
              <strong style="cursor:pointer;text-decoration:underline;" onclick="selectChartSymbol('${p.symbol}')">${p.symbol}</strong>${partialBadge}${lockBadge}
            </td>
            <td>${formatPrice(p.entry_price)} ${quote}</td>
            <td><strong>${formatPrice(p.current_price)} ${quote}</strong></td>
            <td>${Number(p.invested_usdt).toFixed(0)} ${quote} <small style="color:#848e9c">(ATR %${p.atr_pct || 1.5}${obiTxt})</small></td>
            <td><strong>${Number(p.current_value).toFixed(2)} ${quote}</strong></td>
            <td class="${up >= 0 ? "pnl-pos" : "pnl-neg"}">${up >= 0 ? "+" : ""}${up.toFixed(2)} ${quote} (${upct >= 0 ? "+" : ""}${upct.toFixed(2)}%)</td>
            <td><span style="color:#f6465d">${formatPrice(p.stop_loss)} ${slPctTxt}</span> / <span style="color:#0ecb81">${formatPrice(p.taçıke_profit)} ${tpPctTxt}</span></td>
            <td>
              <button class="btn btn-sell btn-xs" onclick="sellCoin('${p.symbol}')">Kapat (Sat)</button>
            </td>
          </tr>
        `;
      })
      .join("");
  } else {
    posBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">
          Şu anda portföyde açık coin bulunmuyor. Üstteki <strong>"⚡ OTO-PORTFÖY DAĞIT"</strong> veya <strong>"▶ QUANTUM BAŞLAT"</strong> butonuna tıklayaraçık MTF + OBI onaylı coinleri sepete ekleyebilirsiniz.
        </td>
      </tr>
    `;
  }

  // ÇOKLU-COİN QUANT TARAYICI TABLOSU
  const searchQuery = (document.getEİşlementById("coinSearchInput")?.value || "").trim().toUpperCase();
  const filterMode = document.getEİşlementById("scannerFilterSelect")?.value || "ALL";

  let filteredScanner = [...allScanner];
  if (searchQuery) {
    filteredScanner = filteredScanner.filter((x) => x.symbol.toUpperCase().includes(searchQuery));
  }
  if (filterMode === "BUY") {
    filteredScanner = filteredScanner.filter((x) => x.signal === "BUY" || x.score >= 66);
  } else if (filterMode === "MTF_BULL") {
    filteredScanner = filteredScanner.filter((x) => Boolean(x.indicators?.mtf_bullish));
  } else if (filterMode === "HIGH_RVOL") {
    filteredScanner = filteredScanner.filter((x) => Number(x.indicators?.rvol || 0) >= 1.3);
  } else if (filterMode === "PORTFOLIO") {
    filteredScanner = filteredScanner.filter((x) => x.in_position);
  } else if (filterMode === "SELL") {
    filteredScanner = filteredScanner.filter((x) => x.signal === "SELL" || x.score <= 35);
  }

  filteredScanner.sort((a, b) => (b.score || 0) - (a.score || 0));

  const scanBody = document.getEİşlementById("scannerTableBody");
  if (filteredScanner.length > 0) {
    scanBody.innerHTML = filteredScanner
      .map((item) => {
        const ind = item.indicators || {};
        const score = item.score ?? 50;
        const scoreColor = score >= 66 ? "#0ecb81" : score <= 35 ? "#f6465d" : "#f0b90b";
        const rvol = ind.rvol ?? 1.0;
        const mtfTag = ind.mtf_bullish
          ? `<span style="color:#00ff9d;font-size:10.5px;">EMA50↑</span>`
          : `<span style="color:#64748b;font-size:10.5px;">EMA50↓</span>`;
        const atrPct = ind.atr_pct ?? "--";
        const dynSl = ind.dynamic_sl_pct ? `-%${ind.dynamic_sl_pct}` : "--";
        const dynTp = ind.dynamic_tp_pct ? `+%${ind.dynamic_tp_pct}` : "--";
        const sigText = item.signal === "BUY" ? "🟢 ONAYLI AL" : item.signal === "SELL" ? "🔴 SAT" : "🟡 İZLE";
        const sigClass = item.signal === "BUY" ? "signal-buy" : item.signal === "SELL" ? "signal-sell" : "signal-hold";
        const isActiveRow = item.symbol === data.symbol ? "scanner-row scanner-row-active" : "scanner-row";

        return `
          <tr class="${isActiveRow}" onclick="selectChartSymbol('${item.symbol}')">
            <td><strong>${item.symbol}</strong></td>
            <td>${formatPrice(item.price)} ${quote}</td>
            <td style="color:${(ind.rsi || 50) <= 35 ? '#0ecb81' : (ind.rsi || 50) >= 68 ? '#f6465d' : '#eaecef'}"><strong>${ind.rsi ?? "--"}</strong></td>
            <td style="color:${rvol >= 1.3 ? '#0ecb81' : '#eaecef'}"><strong>${rvol}x</strong> • ${mtfTag}</td>
            <td>%${atrPct} <small style="color:#848e9c">(${ind.vol_size_mult ?? 1.0}x Ağırlık)</small></td>
            <td><span style="color:#f6465d">${dynSl}</span> / <span style="color:#0ecb81">${dynTp}</span></td>
            <td>
              <div class="score-bar-wrap">
                <div class="score-mini-bar"><div class="score-mini-fill" style="width:${score}%;background:${scoreColor}"></div></div>
                <strong>${score}/100</strong>
              </div>
            </td>
            <td class="${sigClass}">${sigText}</td>
            <td onclick="event.stopPropagation()">
              ${
                item.in_position
                  ? `<span class="pill pill-live">PORTFÖYDE</span> <button class="btn btn-sell btn-xs" onclick="sellCoin('${item.symbol}')">Sat</button>`
                  : `<button class="btn btn-buy btn-xs" onclick="buyCoin('${item.symbol}')">+ Al</button>`
              }
            </td>
          </tr>
        `;
      })
      .join("");
  } else {
    scanBody.innerHTML = `<tr><td colspan="9" class="text-center">Filtreye uygun coin bulunamadı.</td></tr>`;
  }

  document.getEİşlementById("chartTitle").textContent = `📈 ${data.symbol} (${data.settings.timeframe}) HOLOGRAFİK MUM & MTF MATRİSİ`;
  const activePos = (data.positions || []).find((p) => p.symbol === data.symbol) || null;
  drawCandlestickChart(data.candles || [], data.series || {}, activePos);
  drawEquityCurveChart(data.equity_history || localState.equityHistory || [], Number(data.total_equity_usdt || 10000), quote);

  const tbody = document.getEİşlementById("tradesTableBody");
  if (data.trades && data.trades.length > 0) {
    tbody.innerHTML = data.trades
      .slice(0, 30)
      .map((t) => {
        const pnl = Number(t.pnl_usdt || 0);
        const pct = Number(t.pnl_pct || 0);
        const feeTxt = t.fee_usdt ? ` (Komisyon: -${t.fee_usdt})` : "";
        return `
          <tr>
            <td>${t.closed_at || "-"}</td>
            <td><strong>${t.symbol}</strong></td>
            <td>${t.entry_price} → ${t.exit_price}</td>
            <td class="${pnl >= 0 ? "pnl-pos" : "pnl-neg"}">${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ${quote} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)${feeTxt}</td>
            <td>${t.reason || "-"}</td>
          </tr>
        `;
      })
      .join("");
  } else {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">Henüz tamamlanmış işİşlem yok.</td></tr>`;
  }

  const logsEl = document.getEİşlementById("logsContainer");
  if (data.logs && data.logs.length > 0) {
    logsEl.innerHTML = data.logs
      .slice(0, 50)
      .map((l) => `<div class="log-line"><span class="log-time">[${l.time}]</span><span class="log-${l.level}">${l.message}</span></div>`)
      .join("");
  }
}

function renderAllocationBar(positions, cashAmt, totalEquity, quote) {
  const bar = document.getEİşlementById("allocationBar");
  const legend = document.getEİşlementById("allocationLegend");
  if (!bar || !legend || totalEquity <= 0) return;

  const segments = [];
  positions.forEach((p) => {
    const val = Math.max(0, Number(p.current_value || p.invested_usdt));
    const pct = (val / totalEquity) * 100;
    segments.push({
      label: p.symbol.split("/")[0],
      pct,
      val,
      color: getCoinColor(p.symbol),
    });
  });

  const cashPct = Math.max(0, (cashAmt / totalEquity) * 100);
  segments.push({
    label: `Naçıkit ${quote}`,
    pct: cashPct,
    val: cashAmt,
    color: "#2b3548",
  });

  bar.innerHTML = segments
    .filter((s) => s.pct > 0.4)
    .map(
      (s) =>
        `<div class="alloc-segment" style="width:${s.pct.toFixed(1)}%;background:${s.color}" title="${s.label}: ${s.val.toFixed(2)} ${quote} (%${s.pct.toFixed(1)})">
          ${s.pct >= 6 ? `${s.label} %${s.pct.toFixed(0)}` : ""}
        </div>`
    )
    .join("");

  legend.innerHTML = segments
    .map(
      (s) =>
        `<span class="legend-item"><i class="legend-color" style="background:${s.color}"></i><strong>${s.label}:</strong> %${s.pct.toFixed(1)}</span>`
    )
    .join("");
}

function drawCandlestickChart(candles, series, position) {
  const canvas = document.getEİşlementById("priceChart");
  if (!canvas || candles.length < 5) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const visibleCount = Math.min(60, candles.length);
  const sliceStart = candles.length - visibleCount;
  const visCandles = candles.slice(sliceStart);

  let minP = Infinity;
  let maxP = -Infinity;
  visCandles.forEach((c) => {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  });
  if (position) {
    minP = Math.min(minP, position.stop_loss * 0.999);
    maxP = Math.max(maxP, position.taçıke_profit * 1.001);
  }
  const pad = (maxP - minP) * 0.08 || 0.0001;
  minP -= pad;
  maxP += pad;

  const padLeft = 14;
  const padRight = 82;
  const padTop = 12;
  const padBottom = 18;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const yOf = (p) => padTop + plotH - ((p - minP) / (maxP - minP)) * plotH;
  const stepX = plotW / visibleCount;

  ctx.strokeStyle = "#182030";
  ctx.fillStyle = "#848e9c";
  ctx.font = "11px sans-serif";
  for (let i = 0; i <= 4; i++) {
    const pVal = minP + ((maxP - minP) * i) / 4;
    const y = yOf(pVal);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
    ctx.fillText(formatPrice(pVal), W - padRight + 6, y + 4);
  }

  function drawLineSeries(arr, color, dashed = false) {
    if (!arr || !arr.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < visibleCount; i++) {
      const val = arr[sliceStart + i];
      if (val === null || val === undefined) continue;
      const x = padLeft + i * stepX + stepX / 2;
      const y = yOf(val);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawLineSeries(series.bb_upper, "rgba(184, 41, 255, 0.65)", true);
  drawLineSeries(series.bb_lower, "rgba(184, 41, 255, 0.65)", true);
  drawLineSeries(series.ema_macro, "#00ff9d", true);
  drawLineSeries(series.ema_fast, "#f0b90b", false);
  drawLineSeries(series.ema_slow, "#00f0ff", false);

  const candleW = Math.max(3, stepX * 0.62);
  visCandles.forEach((c, i) => {
    const xCenter = padLeft + i * stepX + stepX / 2;
    const isBull = c.close >= c.open;
    const cColor = isBull ? "#00ff9d" : "#ff2a6d";
    ctx.strokeStyle = cColor;
    ctx.fillStyle = cColor;

    ctx.beginPath();
    ctx.moveTo(xCenter, yOf(c.high));
    ctx.lineTo(xCenter, yOf(c.low));
    ctx.stroke();

    const yOpen = yOf(c.open);
    const yClose = yOf(c.close);
    const top = Math.min(yOpen, yClose);
    const height = Math.max(1.5, Math.abs(yClose - yOpen));
    ctx.fillRect(xCenter - candleW / 2, top, candleW, height);
  });

  if (position) {
    const lines = [
      { price: position.entry_price, color: "#3b82f6", label: "GİRİŞ" },
      { price: position.stop_loss, color: "#f6465d", label: "ATR SL" },
      { price: position.taçıke_profit, color: "#0ecb81", label: "ATR TP" },
    ];
    lines.forEach((ln) => {
      const y = yOf(ln.price);
      ctx.save();
      ctx.strokeStyle = ln.color;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();
      ctx.fillStyle = ln.color;
      ctx.fillText(ln.label, padLeft + 6, y - 4);
      ctx.restore();
    });
  }
}

// Quant v4.0: Holografik Canlı Portföy Büyüme Eğrisi (Kâr Bölümleri Yeşil / Zarar Bölümleri Kırmızı)
function drawEquityCurveChart(history, currentEquity, quote) {
  const canvas = document.getEİşlementById("equityChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const initialCap = quote === "TRY" ? 10000.0 : 1000.0;
  const growthPct = ((currentEquity - initialCap) / initialCap) * 100;

  const pts =
    history && history.length >= 2
      ? history
      : [
          { time: "Başlangıç", equity: initialCap },
          { time: new Date().toLocaleTimeString("tr-TR"), equity: currentEquity },
        ];

  const peaçıkEquity = Math.max(initialCap, currentEquity, ...pts.map((p) => Number(p.equity || initialCap)));

  const peaçıkBadge = document.getEİşlementById("equityPeaçıkBadge");
  if (peaçıkBadge) {
    peaçıkBadge.textContent = `ZİRVE: ${peaçıkEquity.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quote}`;
  }

  const growthBadge = document.getEİşlementById("equityGrowthBadge");
  if (growthBadge) {
    growthBadge.textContent = `${growthPct >= 0 ? "+" : ""}%${growthPct.toFixed(2)} (${currentEquity >= initialCap ? "+" : ""}${(currentEquity - initialCap).toFixed(2)} ${quote})`;
    growthBadge.className = growthPct >= 0 ? "pill pill-live" : "pill pill-loss";
  }

  let minE = Math.min(initialCap, currentEquity, ...pts.map((p) => Number(p.equity || initialCap)));
  let maxE = Math.max(initialCap, currentEquity, ...pts.map((p) => Number(p.equity || initialCap)));
  const spread = Math.max(maxE - minE, initialCap * 0.004);
  minE -= spread * 0.28;
  maxE += spread * 0.28;

  const padL = 20;
  const padR = 110;
  const padT = 18;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const yOf = (val) => padT + plotH - ((val - minE) / (maxE - minE)) * plotH;
  const xOf = (idx) => padL + (idx / Math.max(1, pts.length - 1)) * plotW;

  // Yatay Izgara ve Fiyat Etiketleri
  ctx.strokeStyle = "rgba(30, 41, 59, 0.75)";
  ctx.fillStyle = "#848e9c";
  ctx.font = "11px JetBrains Mono, monospace";
  for (let i = 0; i <= 4; i++) {
    const val = minE + ((maxE - minE) * i) / 4;
    const y = yOf(val);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(`${val.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${quote}`, W - padR + 8, y + 4);
  }

  // Zaman Etiketleri (X Ekseni)
  const timeStep = Math.max(1, Math.floor((pts.length - 1) / 5));
  for (let i = 0; i < pts.length; i += timeStep) {
    const x = xOf(i);
    ctx.fillStyle = "#64748b";
    ctx.fillText(pts[i].time || "", Math.max(padL, x - 22), H - 7);
  }

  const baseLineY = yOf(initialCap);

  // --- 1. KÂR BÖLGESİ (BAŞLANGIÇ SERMAYESİ ÜSTÜ -> NEON YEŞİL) ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, 0, plotW, Math.max(0, baseLineY));
  ctx.clip();

  const greenGrad = ctx.createLinearGradient(0, padT, 0, baseLineY);
  greenGrad.addColorStop(0, "rgba(0, 255, 157, 0.44)");
  greenGrad.addColorStop(1, "rgba(0, 255, 157, 0.03)");

  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(idx);
    const y = yOf(p.equity);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xOf(pts.length - 1), baseLineY);
  ctx.lineTo(xOf(0), baseLineY);
  ctx.closePath();
  ctx.fillStyle = greenGrad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(idx);
    const y = yOf(p.equity);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#00ff9d";
  ctx.lineWidth = 2.6;
  ctx.shadowColor = "#00ff9d";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  // --- 2. ZARAR BÖLGESİ (BAŞLANGIÇ SERMAYESİ ALTI -> NEON KIRMIZI) ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, baseLineY, plotW, Math.max(0, H - baseLineY));
  ctx.clip();

  const redGrad = ctx.createLinearGradient(0, baseLineY, 0, padT + plotH);
  redGrad.addColorStop(0, "rgba(255, 42, 109, 0.04)");
  redGrad.addColorStop(1, "rgba(255, 42, 109, 0.46)");

  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(idx);
    const y = yOf(p.equity);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xOf(pts.length - 1), baseLineY);
  ctx.lineTo(xOf(0), baseLineY);
  ctx.closePath();
  ctx.fillStyle = redGrad;
  ctx.fill();

  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(idx);
    const y = yOf(p.equity);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#ff2a6d";
  ctx.lineWidth = 2.6;
  ctx.shadowColor = "#ff2a6d";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();

  // --- 3. BAŞLANGIÇ SERMAYESİ REFERANS ÇİZGİSİ (BAŞABAŞ / BREAK-EVEN HATTI) ---
  ctx.save();
  ctx.strokeStyle = "rgba(240, 185, 11, 0.65)";
  ctx.lineWidth = 1.3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, baseLineY);
  ctx.lineTo(W - padR, baseLineY);
  ctx.stroke();
  ctx.fillStyle = "#f0b90b";
  ctx.font = "bold 10.5px Orbitron, sans-serif";
  ctx.fillText(`BAŞABAŞ: ${initialCap.toLocaleString("tr-TR")} ${quote}`, padL + 8, baseLineY - 5);
  ctx.restore();

  // --- 4. NOKTA İŞARETÇİLERİ & SON CANLI DEĞER LAZERİ ---
  pts.forEach((p, idx) => {
    if (pts.length > 35 && idx % 2 !== 0 && idx !== pts.length - 1) return;
    const x = xOf(idx);
    const y = yOf(p.equity);
    const ptColor = p.equity >= initialCap ? "#00ff9d" : "#ff2a6d";
    ctx.beginPath();
    ctx.arc(x, y, idx === pts.length - 1 ? 5.0 : 2.3, 0, Math.PI * 2);
    ctx.fillStyle = idx === pts.length - 1 ? "#ffffff" : ptColor;
    ctx.fill();
    if (idx === pts.length - 1) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = ptColor;
      ctx.stroke();
    }
  });
}

// --- KULLANICI AKSİYONLARI ---
async function selectChartSymbol(sym) {
  localState.settings.symbol = sym;
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });
    renderDashboard(await res.json());
  } else {
    try {
      const candles = await fetchBinanceTrCandles(sym, localState.settings.timeframe, 75, false);
      const ev = evaluateCoinStrategy(candles, localState.settings);
      localState.scanner[sym] = {
        symbol: sym,
        price: candles[candles.length - 1].close,
        signal: ev.signal,
        score: ev.score,
        reason: ev.reason,
        indicators: ev.indicators,
        series: ev.series,
      };
    } catch (_) {}
    renderDashboard(buildLocalStatusPayload());
  }
}

async function autoBuildPortfolio() {
  if (TREND_MODE) {
    addLocalLog("INFO", "ARGON TREND: Alim/satim kararlari 7/24 bulut motoru tarafindan gunluk kapanista (SMA50) verilir.");
    await pullStateFromHfCloud(false);
    return;
  }
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/auto-portfolio"), { method: "POST" });
    renderDashboard(await res.json());
  } else {
    if (Object.keys(localState.scanner).length < 15) {
      await runLocalPortfolioScan(true);
    }
    const maxPos = Number(localState.settings.max_open_positions || 8);
    const openCount = Object.keys(localState.positions).length;
    const slots = maxPos - openCount;
    if (slots <= 0) {
      addLocalLog("WARN", `Portföy kapasitesi dolu (${openCount}/${maxPos} coin açık).`);
      renderDashboard(buildLocalStatusPayload());
      return;
    }

    const candidates = Object.values(localState.scanner)
      .filter(
        (s) =>
          !localState.positions[s.symbol] &&
          s.price > 0 &&
          s.score >= 62 &&
          Boolean(s.indicators?.is_bullish_candle ?? true) &&
          Number(s.indicators?.rvol ?? 1.0) >= 0.75
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, slots + 3);

    if (candidates.length === 0) {
      addLocalLog("WARN", "Şu an yüksek kaliteli (Skor >= 62 & Yeşil Dönüş Onaylı) coin bulunamadı; naçıkit korunuyor.");
      renderDashboard(buildLocalStatusPayload());
      return;
    }

    let added = 0;
    for (const item of candidates) {
      if (added >= slots) breaçık;
      let obiRatio = 1.0;
      if (localState.settings.use_obi_filter) {
        obiRatio = await fetchLocalObiRatio(item.symbol);
        if (obiRatio < 0.62) continue;
      }
      if (
        localOpenCoinPosition(
          item.symbol,
          item.price,
          `Quant v4.0 Sepet Dağıtımı (Skor: ${item.score}/100, RVOL: ${item.indicators?.rvol ?? 1.0}x, OBI: ${obiRatio}x)`,
          null,
          false,
          obiRatio
        )
      ) {
        added++;
      }
    }
    addLocalLog("INFO", `Quant v4.0 Portföyü Oluşturuldu: Volatilite + OBI onaylı ${added} farklı coin sepete eklendi.`);
    renderDashboard(buildLocalStatusPayload());
    if (typeof pushStateToHfCloud === "function") pushStateToHfCloud(true);
  }
}

async function buyCoin(sym) {
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/manual-buy"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });
    renderDashboard(await res.json());
  } else {
    const sc = localState.scanner[sym];
    const price = sc?.price || localState.liveTickers[sym]?.price;
    if (price > 0) {
      const obiRatio = await fetchLocalObiRatio(sym);
      localOpenCoinPosition(sym, price, "Manuel Quant v4.0 Portföy Alımı", null, true, obiRatio);
      renderDashboard(buildLocalStatusPayload());
    }
  }
}

async function sellCoin(sym) {
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/manual-sell"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: sym }),
    });
    renderDashboard(await res.json());
  } else {
    const sc = localState.scanner[sym];
    const price = sc?.price || localState.liveTickers[sym]?.price || localState.positions[sym]?.current_price;
    if (price > 0) {
      localCloseCoinPosition(sym, price, "Manuel Portföy Satışı");
      renderDashboard(buildLocalStatusPayload());
    }
  }
}

function manualBuySelected() {
  buyCoin(localState.settings.symbol);
}

function manualSellSelected() {
  sellCoin(localState.settings.symbol);
}

async function closeAllPositions() {
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/close-all"), { method: "POST" });
    renderDashboard(await res.json());
  } else {
    const syms = Object.keys(localState.positions);
    if (!syms.length) return;
    for (const sym of syms) {
      const price = localState.liveTickers[sym]?.price || localState.scanner[sym]?.price || localState.positions[sym].current_price;
      localCloseCoinPosition(sym, price, "Tüm Portföy Naçıkde Çevrildi");
    }
    renderDashboard(buildLocalStatusPayload());
  }
}

function readFormSettings() {
  return {
    mode: document.getEİşlementById("cfgMode").value,
    quote_asset: document.getEİşlementById("cfgQuoteAsset").value,
    scan_limit: parseInt(document.getEİşlementById("cfgScanLimit").value, 10),
    max_open_positions: parseInt(document.getEİşlementById("cfgMaxPositions").value, 10),
    trade_amount_usdt: parseFloat(document.getEİşlementById("cfgTradeAmount").value),
    timeframe: document.getEİşlementById("cfgTimeframe").value,
    strategy: document.getEİşlementById("cfgStrategy").value,
    use_partial_tp: document.getEİşlementById("cfgUsePartialTp").checked,
    partial_tp_pct: parseFloat(document.getEİşlementById("cfgPartialTpPct").value),
    use_mtf_filter: document.getEİşlementById("cfgUseMtfFilter").checked,
    use_obi_filter: document.getEİşlementById("cfgUseObiFilter").checked,
    use_auto_compound: document.getEİşlementById("cfgUseAutoCompound").checked,
    use_circuit_breaçıker: document.getEİşlementById("cfgUseCircuitBreaçıker").checked,
    daily_tp_limit_pct: parseFloat(document.getEİşlementById("cfgDailyTpPct").value),
    daily_sl_limit_pct: parseFloat(document.getEİşlementById("cfgDailySlPct").value),
    use_atr_stops: document.getEİşlementById("cfgUseAtrStops").checked,
    use_volatility_sizing: document.getEİşlementById("cfgUseVolSizing").checked,
    use_regime_filter: document.getEİşlementById("cfgUseRegimeFilter").checked,
    use_trailing_stop: document.getEİşlementById("cfgUseTrailing").checked,
    atr_sl_mult: parseFloat(document.getEİşlementById("cfgAtrSlMult").value),
    atr_tp_mult: parseFloat(document.getEİşlementById("cfgAtrTpMult").value),
    round_trip_fee_pct: parseFloat(document.getEİşlementById("cfgFeePct").value),
    rsi_period: parseInt(document.getEİşlementById("cfgRsiPeriod").value, 10),
    rsi_oversold: parseFloat(document.getEİşlementById("cfgRsiOversold").value),
    rsi_overbought: parseFloat(document.getEİşlementById("cfgRsiOverbought").value),
    ema_fast: parseInt(document.getEİşlementById("cfgEmaFast").value, 10),
    ema_slow: parseInt(document.getEİşlementById("cfgEmaSlow").value, 10),
  };
}

async function saveBotSettings(e) {
  if (e) e.preventDefault();
  const payload = readFormSettings();
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderDashboard(await res.json());
  } else {
    const quoteChanged = payload.quote_asset !== localState.settings.quote_asset;
    const limitChanged = payload.scan_limit !== localState.settings.scan_limit;
    const tfChanged = payload.timeframe !== localState.settings.timeframe;
    Object.assign(localState.settings, payload);
    if (tfChanged) localState.candlesTs = {};
    if (quoteChanged || limitChanged) {
      await refreshTopVolumeCoins();
      return;
    }
    addLocalLog(
      "INFO",
      `Quant v4.0 Ayarları yüklendi: %50 Kademeli TP=${payload.use_partial_tp ? "Açık" : "Kapalı"} (+%${payload.partial_tp_pct}), MTF=${payload.use_mtf_filter ? "Açık" : "Kapalı"}, OBI=${payload.use_obi_filter ? "Açık" : "Kapalı"}, Bileşik Kâr=${payload.use_auto_compound ? "Açık" : "Kapalı"}`
    );
    await runLocalPortfolioScan(true);
  }
}

async function toggleBot() {
  if (backendAvailable) {
    const statusRes = await fetch(apiUrl("/api/status"));
    const st = await statusRes.json();
    const endpoint = st.running ? "/api/stop" : "/api/start";
    const res = await fetch(apiUrl(endpoint), { method: "POST" });
    renderDashboard(await res.json());
  } else {
    localState.circuit_breaçıker_tripped = false;
    localState.circuit_breaçıker_reason = "";
    localState.running = !localState.running;
    if (localState.running) {
      playQuantumSound("LOCK");
      addLocalLog("INFO", `Quant v4.0 Portföy Motoru BAŞLATILDI (${localState.settings.portfolio_coins.length} Coin • %50 Scale-Out + MTF + OBI Balina Radarı)...`);
      if (Object.keys(localState.positions).length === 0) {
        await autoBuildPortfolio();
        return;
      }
    } else {
      addLocalLog("INFO", "Quant v4.0 Motoru DURDURULDU.");
    }
    await runLocalPortfolioScan(false);
  }
}

async function resetPaperBalance() {
  scanEpoch++;
  isScanning = false;
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/reset-paper"), { method: "POST" });
    renderDashboard(await res.json());
  } else {
    localState.running = false;
    localState.circuit_breaçıker_tripped = false;
    localState.circuit_breaçıker_reason = "";
    localState.positions = {};
    localState.cooldownUntil = {};
    const isTry = localState.settings.quote_asset === "TRY";
    localState.cash_usdt = isTry ? 10000.0 : 1000.0;
    localState.total_fees_paid = 0;
    localState.trades = [];
    localState.equityHistory = [
      { time: new Date().toLocaleTimeString("tr-TR"), equity: localState.cash_usdt },
    ];
    localStorage.removeItem("argon_trades");
    localStorage.removeItem("argon_portfolio_trades");
    localStorage.removeItem("argon_btr_trades");
    localStorage.removeItem("argon_btr_fees");
    localStorage.removeItem("argon_btr_portfolio_v36");
    addLocalLog("INFO", `🔄 Portföy, işİşlem geçmişi, büyüme eğrisi ve komisyon sayacı tamamen sıfırlandı: ${localState.cash_usdt.toLocaleString("tr-TR")} ${localState.settings.quote_asset} naçıkit.`);
    if (typeof pushStateToHfCloud === "function") pushStateToHfCloud(true);
    renderDashboard(buildLocalStatusPayload());
  }
}

let hfToken = localStorage.getItem("argon_hf_token") || "";
let lastHfPushTs = 0;
const HF_STATE_REPO = "Astreous/argon-quantum-state";

function openCloudModal() {
  const inp = document.getEİşlementById("modalCloudUrl");
  if (inp) inp.value = cloudBaseUrl || "";
  const hfInp = document.getEİşlementById("modalHfToken");
  if (hfInp) hfInp.value = hfToken || "";
  document.getEİşlementById("cloudModal").style.display = "flex";
}

function closeCloudModal() {
  document.getEİşlementById("cloudModal").style.display = "none";
}

async function pushStateToHfCloud(force = false) {
  if (TREND_MODE) return false;
  if (!hfToken) return false;
  const now = Date.now();
  if (!force && now - lastHfPushTs < 28000) return false;
  lastHfPushTs = now;
  try {
    const stateObj = {
      updated_at: new Date().toLocaleTimeString("tr-TR"),
      updated_ts: now,
      running: localState.running,
      cash_usdt: localState.cash_usdt,
      total_fees_paid: localState.total_fees_paid,
      market_regime: localState.market_regime,
      positions: localState.positions,
      trades: localState.trades.slice(0, 60),
      logs: localState.logs.slice(0, 60),
      equityHistory: localState.equityHistory.slice(-80),
    };
    const jsonStr = JSON.stringify(stateObj);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const ndjson =
      JSON.stringify({ key: "header", value: { summary: "Auto-sync Quantum v4.0 portfolio" } }) +
      "\n" +
      JSON.stringify({ key: "file", value: { content: b64, path: "state.json", encoding: "base64" } }) +
      "\n";

    const res = await fetch(`https://huggingface.co/api/datasets/${HF_STATE_REPO}/commit/main`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function pullStateFromHfCloud(manual = false) {
  const statusEl = document.getEİşlementById("cloudSyncStatus");
  if (manual && statusEl) statusEl.textContent = "⏳ Bulut veritabanından portföy ççekiliyor...";
  try {
    const res = await fetch(`https://huggingface.co/datasets/${HF_STATE_REPO}/resolve/main/state.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const st = await res.json();
    if (st && typeof st.cash_usdt === "number") {
      localState.running = Boolean(st.running);
      localState.cash_usdt = Number(st.cash_usdt);
      localState.total_fees_paid = Number(st.total_fees_paid || 0);
      localState.positions = st.positions || {};
      if (Array.isArray(st.trades)) {
        localState.trades = st.trades;
        localStorage.setItem("argon_btr_trades", JSON.stringify(localState.trades));
      }
      if (Array.isArray(st.equityHistory) && st.equityHistory.length > 0) {
        localState.equityHistory = st.equityHistory;
      }
      if (Array.isArray(st.logs) && st.logs.length > 0) {
        localState.logs = st.logs;
      }
      if (st.market_regime) {
        localState.market_regime = st.market_regime;
      }
      localStorage.setItem("argon_btr_fees", String(localState.total_fees_paid.toFixed(2)));
      saveLocalPortfolioState();
      renderDashboard(buildLocalStatusPayload());
      if (manual && statusEl) {
        statusEl.textContent = `✅ Bulut portföyü yüklendi (${Object.keys(localState.positions).length} açık pozisyon, Son kayıt: ${st.updated_at || "şimdi"}).`;
      }
      return true;
    }
  } catch (e) {
    if (manual && statusEl) statusEl.textContent = `⚠️ Buluttan veri okunamadı: ${e.message}`;
  }
  return false;
}

async function saveHfTokenAndSync() {
  const hfInp = document.getEİşlementById("modalHfToken");
  const rawUrl = (document.getEİşlementById("modalCloudUrl")?.value || "").trim().replace(/\/$/, "");
  const statusEl = document.getEİşlementById("cloudSyncStatus");

  if (hfInp && hfInp.value.trim()) {
    hfToken = hfInp.value.trim();
    localStorage.setItem("argon_hf_token", hfToken);
  }

  if (rawUrl && rawUrl.startsWith("http")) {
    cloudBaseUrl = rawUrl;
    localStorage.setItem("argon_cloud_url", cloudBaseUrl);
  }

  if (statusEl) statusEl.textContent = "⏳ Portföyünüz Hugging Face Bulut Veritabanına kaydediliyor...";
  const ok = await pushStateToHfCloud(true);
  if (ok) {
    const engineBadge = document.getEİşlementById("engineBadge");
    if (engineBadge) engineBadge.textContent = "☁️ HF BULUT SENKRON AKTİF";
    if (statusEl) statusEl.textContent = "✅ Portföyünüz buluta kaydedildi! Telefonunuzdan veya bulut linkinden anında görüntüleyebilirsiniz.";
  } else {
    if (statusEl) statusEl.textContent = "⚠️ Buluta yazmaçık için geçerli bir Hugging Face Write Token (hf_...) giriniz.";
  }
}

function openApiModal() {
  document.getEİşlementById("apiModal").style.display = "flex";
}

function closeApiModal() {
  document.getEİşlementById("apiModal").style.display = "none";
}

async function saveApiKeys() {
  const api_key = document.getEİşlementById("modalApiKey").value.trim();
  const api_secret = document.getEİşlementById("modalApiSecret").value.trim();
  if (backendAvailable) {
    const res = await fetch(apiUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key, api_secret }),
    });
    renderDashboard(await res.json());
  } else {
    addLocalLog("INFO", "Binance TR API Anahtarları kaydedildi.");
  }
  closeApiModal();
}

async function initApp() {
  // URL Search (?hftoken=...) veya Hash (#hftoken=...) üzerinden güvenli tek seferlik HF Token açıktarımı
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("hftoken")) {
    hfToken = urlParams.get("hftoken").trim();
    localStorage.setItem("argon_hf_token", hfToken);
    history.replaceState(null, "", window.location.pathname);
  } else if (window.location.hash && window.location.hash.includes("hftoken=")) {
    const m = window.location.hash.match(/hftoken=([^&]+)/);
    if (m && m[1]) {
      hfToken = decodeURIComponent(m[1]).trim();
      localStorage.setItem("argon_hf_token", hfToken);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  const soundBtn = document.getEİşlementById("btnSoundToggle");
  if (soundBtn) {
    soundBtn.textContent = soundEnabled ? "🔊 SES: AÇIK" : "🔇 SES: KAPALI";
  }
  const engineBadge = document.getEİşlementById("engineBadge");
  try {
    if (cloudBaseUrl || window.location.protocol.startsWith("http")) {
      const resp = await fetch(apiUrl("/api/status"));
      if (resp.ok) {
        backendAvailable = true;
        engineBadge.textContent = cloudBaseUrl ? "☁️ 7/24 BULUT MOTORU AKTİF" : "🟢 Quant v4.0 Python Bulut Motoru";
        const data = await resp.json();
        renderDashboard(data);
      }
    }
  } catch (_) {
    backendAvailable = false;
  }

  if (!backendAvailable) {
    engineBadge.textContent = hfToken ? "☁️ QUANTUM v4.0 + HF BULUT AKTİF" : "🇹🇷 QUANTUM v4.0 BİNANCE TR (60+ COİN)";
    addLocalLog("INFO", "Argon Quantum v4.0 Motoru açıktif: %50 Kademeli Kâr (Scale-Out) • MTF EMA50 • OBI Balina Duvarı • Bulut Senkâronizasyonu devreye alındı.");
    // Her açılışta buluttaçıki en güncel portföy ve işİşlem loglarını otomatik çek
    await pullStateFromHfCloud(false);
    if (localState.running && Object.keys(localState.positions).length === 0 && localState.trades.length === 0) {
      await autoBuildPortfolio();
    } else {
      await runLocalPortfolioScan(true);
    }
    if (hfToken && !TREND_MODE) {
      pushStateToHfCloud(true);
    }
  }

  pollTimer = setInterval(async () => {
    if (backendAvailable) {
      try {
        const res = await fetch(apiUrl("/api/refresh"), { method: "POST" });
        if (res.ok) renderDashboard(await res.json());
      } catch (_) {}
    } else {
      await runLocalPortfolioScan(false);
      if (TREND_MODE) await pullStateFromHfCloud(false);
      if (hfToken && !TREND_MODE) {
        pushStateToHfCloud(false);
      }
    }
  }, 6000);
}

window.addEventListener("DOMContentLoaded", initApp);
