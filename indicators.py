from typing import List, Dict, Any, Optional
import math


def calc_sma(values: List[float], period: int) -> List[Optional[float]]:
    result: List[Optional[float]] = [None] * len(values)
    if len(values) < period or period <= 0:
        return result
    window_sum = sum(values[:period])
    result[period - 1] = window_sum / period
    for i in range(period, len(values)):
        window_sum += values[i] - values[i - period]
        result[i] = window_sum / period
    return result


def calc_ema(values: List[float], period: int) -> List[Optional[float]]:
    result: List[Optional[float]] = [None] * len(values)
    if len(values) < period or period <= 0:
        return result
    sma_first = sum(values[:period]) / period
    result[period - 1] = sma_first
    k = 2.0 / (period + 1)
    prev_ema = sma_first
    for i in range(period, len(values)):
        ema_val = (values[i] - prev_ema) * k + prev_ema
        result[i] = ema_val
        prev_ema = ema_val
    return result


def calc_rsi(closes: List[float], period: int = 14) -> List[Optional[float]]:
    result: List[Optional[float]] = [None] * len(closes)
    if len(closes) <= period:
        return result

    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        result[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        result[period] = 100.0 - (100.0 / (1.0 + rs))

    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = max(diff, 0.0)
        loss = max(-diff, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        if avg_loss == 0:
            result[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            result[i] = 100.0 - (100.0 / (1.0 + rs))

    return result


def calc_atr(candles: List[Dict[str, Any]], period: int = 14) -> List[Optional[float]]:
    n = len(candles)
    result: List[Optional[float]] = [None] * n
    if n <= period:
        return result

    trs: List[float] = [float(candles[0]["high"]) - float(candles[0]["low"])]
    for i in range(1, n):
        h = float(candles[i]["high"])
        l = float(candles[i]["low"])
        prev_c = float(candles[i - 1]["close"])
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        trs.append(tr)

    atr_val = sum(trs[1 : period + 1]) / period
    result[period] = atr_val
    for i in range(period + 1, n):
        atr_val = ((atr_val * (period - 1)) + trs[i]) / period
        result[i] = atr_val

    return result


def calc_rvol(candles: List[Dict[str, Any]], period: int = 20) -> float:
    if len(candles) < period + 2:
        return 1.0
    vols = [float(c.get("volume", 0.0)) for c in candles]
    avg_vol = sum(vols[-period - 2 : -2]) / period
    if avg_vol <= 0:
        return 1.0
    recent_vol = max(vols[-1], vols[-2])
    return round(recent_vol / avg_vol, 2)


def calc_macd(
    closes: List[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> Dict[str, List[Optional[float]]]:
    ema_fast = calc_ema(closes, fast)
    ema_slow = calc_ema(closes, slow)
    macd_line: List[Optional[float]] = [None] * len(closes)

    valid_macd_values: List[float] = []
    valid_macd_indices: List[int] = []

    for i in range(len(closes)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            val = float(ema_fast[i]) - float(ema_slow[i])
            macd_line[i] = val
            valid_macd_values.append(val)
            valid_macd_indices.append(i)

    signal_line: List[Optional[float]] = [None] * len(closes)
    histogram: List[Optional[float]] = [None] * len(closes)

    if len(valid_macd_values) >= signal:
        sig_ema = calc_ema(valid_macd_values, signal)
        for idx, sig_val in zip(valid_macd_indices, sig_ema):
            signal_line[idx] = sig_val
            if sig_val is not None and macd_line[idx] is not None:
                histogram[idx] = float(macd_line[idx]) - float(sig_val)

    return {
        "macd": macd_line,
        "signal": signal_line,
        "histogram": histogram,
    }


def calc_bollinger_bands(
    closes: List[float], period: int = 20, std_mult: float = 2.0
) -> Dict[str, List[Optional[float]]]:
    middle = calc_sma(closes, period)
    upper: List[Optional[float]] = [None] * len(closes)
    lower: List[Optional[float]] = [None] * len(closes)

    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1 : i + 1]
        mean = middle[i]
        if mean is None:
            continue
        variance = sum((x - mean) ** 2 for x in window) / period
        std_dev = math.sqrt(variance)
        upper[i] = mean + std_mult * std_dev
        lower[i] = mean - std_mult * std_dev

    return {"upper": upper, "middle": middle, "lower": lower}


def evaluate_strategy(candles: List[Dict[str, Any]], settings: Dict[str, Any], obi_ratio: float = 1.0) -> Dict[str, Any]:
    """
    Quant v4.0 Motoru:
    - Kapanmış mum onayı + Düşen Bıçak Koruması
    - Çoklu Zaman Dilimi (MTF EMA-50 Ana Trend) Onayı
    - Emir Defteri Balina Duvarı (OBI Ratio) Entegrasyonu
    - ATR Dinamik SL/TP & Volatility Parity Ağırlığı
    """
    if len(candles) < 35:
        return {
            "signal": "HOLD",
            "score": 50,
            "reason": "Yeterli mum verisi bekleniyor...",
            "indicators": {},
            "series": {},
        }

    closes = [float(c["close"]) for c in candles]
    opens = [float(c["open"]) for c in candles]
    rsi_period = int(settings.get("rsi_period", 14))
    rsi_oversold = float(settings.get("rsi_oversold", 35))
    rsi_overbought = float(settings.get("rsi_overbought", 68))
    ema_fast_p = int(settings.get("ema_fast", 9))
    ema_slow_p = int(settings.get("ema_slow", 21))
    macd_fast = int(settings.get("macd_fast", 12))
    macd_slow = int(settings.get("macd_slow", 26))
    macd_sig = int(settings.get("macd_signal", 9))
    bb_period = int(settings.get("bb_period", 20))
    bb_std = float(settings.get("bb_std", 2.0))

    rsi_list = calc_rsi(closes, rsi_period)
    ema_fast_list = calc_ema(closes, ema_fast_p)
    ema_slow_list = calc_ema(closes, ema_slow_p)
    ema_macro_list = calc_ema(closes, 50)  # Üst zaman dilimi (MTF) ana trend referansı
    macd_data = calc_macd(closes, macd_fast, macd_slow, macd_sig)
    bb_data = calc_bollinger_bands(closes, bb_period, bb_std)
    atr_list = calc_atr(candles, 14)
    rvol = calc_rvol(candles, 20)

    price = closes[-1]
    open_live = opens[-1]
    closed_price = closes[-2]
    closed_open = opens[-2]

    is_closed_green = closed_price >= closed_open
    is_live_green = price >= open_live and price >= closed_price
    is_bullish_candle = is_closed_green or is_live_green
    is_heavy_dump_candle = (closed_price < closed_open and ((closed_open - closed_price) / closed_open) * 100 > 0.8) or (
        price < open_live and ((open_live - price) / open_live) * 100 > 0.8
    )

    rsi_live = rsi_list[-1] or 50.0
    rsi_closed = rsi_list[-2] or rsi_live
    rsi_prev = rsi_list[-3] or rsi_closed
    rsi_rising = rsi_live >= rsi_closed and rsi_closed >= rsi_prev - 1.0

    ema_fast_live = ema_fast_list[-1] or price
    ema_slow_live = ema_slow_list[-1] or price
    ema_fast_closed = ema_fast_list[-2] or ema_fast_live
    ema_slow_closed = ema_slow_list[-2] or ema_slow_live
    ema_fast_prev = ema_fast_list[-3] or ema_fast_closed
    ema_slow_prev = ema_slow_list[-3] or ema_slow_closed
    ema_macro = ema_macro_list[-1] or ema_slow_live

    # Çoklu Zaman Dilimi (MTF) Onayı: Fiyat ve Yavaş EMA, Macro EMA-50 üzerinde mi?
    mtf_bullish = price >= ema_macro and ema_slow_live >= ema_macro * 0.995

    macd_val = macd_data["macd"][-2] or 0.0
    macd_sig_val = macd_data["signal"][-2] or 0.0
    macd_hist_closed = macd_data["histogram"][-2] or 0.0
    macd_hist_prev = macd_data["histogram"][-3] or 0.0
    macd_rising = macd_hist_closed > macd_hist_prev

    bb_upper = bb_data["upper"][-2] or price * 1.02
    bb_mid = bb_data["middle"][-2] or price
    bb_lower = bb_data["lower"][-2] or price * 0.98

    atr_val = atr_list[-2] or atr_list[-1] or (price * 0.015)
    atr_pct = (atr_val / price) * 100.0 if price > 0 else 1.5

    atr_sl_mult = float(settings.get("atr_sl_mult", 2.0))
    atr_tp_mult = float(settings.get("atr_tp_mult", 3.8))
    dynamic_sl_pct = max(1.6, min(5.5, atr_pct * atr_sl_mult))
    dynamic_tp_pct = max(2.8, min(14.0, atr_pct * atr_tp_mult))

    vol_size_mult = max(0.45, min(1.30, 1.5 / max(0.5, atr_pct)))

    strategy = settings.get("strategy", "multi")
    signal = "HOLD"
    reasons = []

    ema_bullish_cross = ema_fast_prev <= ema_slow_prev and ema_fast_closed > ema_slow_closed
    ema_bearish_cross = ema_fast_prev >= ema_slow_prev and ema_fast_closed < ema_slow_closed
    ema_uptrend = ema_fast_closed > ema_slow_closed and ema_fast_live >= ema_slow_live and price >= ema_fast_live

    macd_bullish_cross = macd_hist_prev <= 0 and macd_hist_closed > 0
    macd_bearish_cross = macd_hist_prev >= 0 and macd_hist_closed < 0

    score = 50

    if rsi_closed <= rsi_oversold:
        if is_bullish_candle and rsi_rising:
            score += 22
            reasons.append(f"Onaylı Dip Dönüşü (RSI {rsi_closed:.1f} ↑)")
        else:
            score -= 10
    elif 45 <= rsi_closed <= 62 and rsi_rising and ema_uptrend:
        score += 14
        reasons.append(f"Güçlü Momentum (RSI {rsi_closed:.1f})")
    elif rsi_closed >= rsi_overbought or rsi_live >= rsi_overbought + 2:
        score -= 25

    if ema_bullish_cross and is_bullish_candle:
        score += 18
        reasons.append("Onaylı EMA Golden Cross")
    elif ema_uptrend:
        score += 12
    elif ema_bearish_cross:
        score -= 22
    else:
        score -= 10

    # MTF (Çoklu Zaman Dilimi) Katkısı
    if settings.get("use_mtf_filter", True):
        if mtf_bullish:
            score += 8
            reasons.append("MTF Üst Trend Pozitif")
        elif price < ema_macro * 0.98 and not (rsi_closed <= rsi_oversold and is_bullish_candle):
            score -= 12

    if macd_bullish_cross and is_bullish_candle:
        score += 14
        reasons.append("MACD Pozitif Kesişim")
    elif macd_hist_closed > 0 and macd_rising:
        score += 8
    elif macd_bearish_cross:
        score -= 16

    if closed_price <= bb_lower * 1.005 and is_bullish_candle and rsi_rising:
        score += 12
        reasons.append("BB Alt Bant Dönüş Onayı")
    elif price >= bb_upper * 0.998 and not ema_uptrend:
        score -= 14

    if rvol >= 1.35:
        if is_closed_green and is_live_green:
            score += 12
            reasons.append(f"Kurumsal Alım Hacmi ({rvol:.1f}x RVOL)")
        elif is_heavy_dump_candle:
            score -= 18
            reasons.append(f"Yüksek Satış Baskısı ({rvol:.1f}x)")
    elif rvol < 0.55:
        score -= 8

    # Emir Defteri Balina Duvarı (OBI Ratio) Katkısı
    if settings.get("use_obi_filter", True) and obi_ratio != 1.0:
        if obi_ratio >= 1.25:
            score += 8
            reasons.append(f"Balina Alış Desteği (OBI {obi_ratio:.2f}x)")
        elif obi_ratio < 0.65:
            score -= 15
            reasons.append(f"Satış Duvarı Engeli (OBI {obi_ratio:.2f}x)")

    if is_heavy_dump_candle:
        score -= 15

    score = max(0, min(100, int(score)))

    if strategy == "rsi_ema":
        if (rsi_prev <= rsi_oversold and rsi_closed > rsi_prev and is_bullish_candle) and ema_uptrend:
            signal = "BUY"
        elif ema_bullish_cross and rsi_closed < rsi_overbought and is_bullish_candle and rvol >= 0.9:
            signal = "BUY"
        elif rsi_closed >= rsi_overbought or (ema_bearish_cross and not is_live_green):
            signal = "SELL"

    elif strategy == "macd":
        if macd_bullish_cross and rsi_closed < rsi_overbought and is_bullish_candle and rvol >= 0.9:
            signal = "BUY"
        elif macd_bearish_cross and rsi_closed > 55:
            signal = "SELL"

    elif strategy == "bollinger":
        if closed_price <= bb_lower * 1.004 and is_bullish_candle and rsi_rising:
            signal = "BUY"
        elif price >= bb_upper * 0.998 and rsi_closed >= rsi_overbought:
            signal = "SELL"

    else:  # "multi" Quant v4.0
        if score >= 70 and is_bullish_candle and not is_heavy_dump_candle and rvol >= 0.80 and obi_ratio >= 0.68:
            signal = "BUY"
        elif score <= 28 and not is_live_green:
            signal = "SELL"

    if not reasons:
        reasons.append(
            f"Quant: {score}/100 • MTF: {'🟢' if mtf_bullish else '🔴'} • OBI: {obi_ratio:.2f}x"
        )

    return {
        "signal": signal,
        "score": score,
        "reason": " • ".join(reasons),
        "indicators": {
            "price": round(price, 6),
            "rsi": round(rsi_closed, 1),
            "rvol": rvol,
            "obi": round(obi_ratio, 2),
            "mtf_bullish": mtf_bullish,
            "atr": round(atr_val, 6),
            "atr_pct": round(atr_pct, 2),
            "dynamic_sl_pct": round(dynamic_sl_pct, 2),
            "dynamic_tp_pct": round(dynamic_tp_pct, 2),
            "vol_size_mult": round(vol_size_mult, 2),
            "is_bullish_candle": is_bullish_candle,
            "ema_fast": round(ema_fast_live, 6),
            "ema_slow": round(ema_slow_live, 6),
            "ema_macro": round(ema_macro, 6),
            "macd": round(macd_val, 5),
            "macd_signal": round(macd_sig_val, 5),
            "macd_hist": round(macd_hist_closed, 5),
            "bb_upper": round(bb_upper, 6),
            "bb_middle": round(bb_mid, 6),
            "bb_lower": round(bb_lower, 6),
        },
        "series": {
            "ema_fast": ema_fast_list,
            "ema_slow": ema_slow_list,
            "ema_macro": ema_macro_list,
            "rsi": rsi_list,
            "bb_upper": bb_data["upper"],
            "bb_lower": bb_data["lower"],
        },
    }
