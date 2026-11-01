import time
import json
import hmac
import hashlib
import threading
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import requests

from config import load_settings, save_settings, BASE_DIR, BINANCE_TR_60_COINS
from indicators import evaluate_strategy

HISTORY_FILE = BASE_DIR / "trades_history.json"
STATE_FILE = BASE_DIR / "portfolio_state.json"


class TradingBotEngine:
    def __init__(self):
        self.settings = load_settings()
        self.running = False
        self.lock = threading.Lock()
        self.thread: Optional[threading.Thread] = None

        self.paper_balance_usdt: float = float(self.settings.get("initial_paper_balance", 10000.0))
        self.total_fees_paid: float = 0.0
        self.positions: Dict[str, Dict[str, Any]] = {}
        self.cooldown_until: Dict[str, float] = {}
        self.scanner_data: Dict[str, Dict[str, Any]] = {}
        self.candles_cache: Dict[str, List[Dict[str, Any]]] = {}
        self.candles_ts: Dict[str, float] = {}
        self.live_tickers: Dict[str, Dict[str, float]] = {}
        self.equity_history: List[Dict[str, Any]] = []
        self.circuit_breaker_until: float = 0.0

        self.market_regime: Dict[str, Any] = {
            "state": "NEUTRAL",
            "label": "🟡 SEÇİCİ / DENGELİ REJİM",
            "btc_rsi": 50.0,
            "btc_trend": "YATAY",
            "max_pos_multiplier": 1.0,
        }

        self.trades: List[Dict[str, Any]] = self._load_trades()
        self.logs: List[Dict[str, str]] = []
        self.last_update_ts: str = "-"
        self._load_portfolio_state()
        self._log("INFO", "Argon Quant v4.0 Bulut Motoru (7/24 Kesintisiz • %50 Kademeli TP • MTF • OBI Balina Radarı) hazırlandı.")
        if self.running:
            self.running = False
            self.start()

    def _load_portfolio_state(self):
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    st = json.load(f)
                self.running = bool(st.get("running", False))
                self.paper_balance_usdt = float(st.get("cash_usdt", self.paper_balance_usdt))
                self.total_fees_paid = float(st.get("total_fees_paid", 0.0))
                self.positions = st.get("positions", {}) or {}
                self.equity_history = st.get("equity_history", []) or []
            except Exception:
                pass

    def _save_portfolio_state(self):
        try:
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "running": self.running,
                        "cash_usdt": round(self.paper_balance_usdt, 2),
                        "total_fees_paid": round(self.total_fees_paid, 2),
                        "positions": self.positions,
                        "equity_history": self.equity_history[-90:],
                    },
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
        except Exception:
            pass

    def sync_from_client(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Tarayıcıdaki mevcut açık portföyü ve işlem geçmişini bulut sunucusuna aktarır."""
        if "cash_usdt" in payload:
            self.paper_balance_usdt = float(payload["cash_usdt"])
        if "total_fees_paid" in payload:
            self.total_fees_paid = float(payload["total_fees_paid"])
        if "positions" in payload and isinstance(payload["positions"], dict):
            self.positions = payload["positions"]
        if "trades" in payload and isinstance(payload["trades"], list):
            self.trades = payload["trades"]
            self._save_trades()
        if "equity_history" in payload and isinstance(payload["equity_history"], list):
            self.equity_history = payload["equity_history"][-90:]
        if payload.get("running") and not self.running:
            self.start()
        self._save_portfolio_state()
        self._log("INFO", f"☁️ Tarayıcı portföyü bulut sunucusuna senkronize edildi ({len(self.positions)} açık pozisyon).")
        return self.get_status()

    def _log(self, level: str, message: str):
        now_str = datetime.now().strftime("%H:%M:%S")
        entry = {"time": now_str, "level": level, "message": message}
        self.logs.insert(0, entry)
        if len(self.logs) > 150:
            self.logs = self.logs[:150]

    def _load_trades(self) -> List[Dict[str, Any]]:
        if HISTORY_FILE.exists():
            try:
                with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_trades(self):
        try:
            with open(HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(self.trades[:200], f, indent=2, ensure_ascii=False)
        except Exception as e:
            self._log("ERROR", f"İşlem geçmişi kaydedilemedi: {e}")

    def fetch_obi_ratio(self, symbol: str) -> float:
        """
        Emir Defteri Balina Duvarı Analizi (Order Book Imbalance - OBI):
        İlk 20 kademedeki Alış (Bid) hacminin Satış (Ask) hacmine oranını hesaplar.
        """
        raw_symbol = symbol.replace("/", "").replace("_", "").upper()
        endpoints = [
            "https://api.binance.me/api/v3/depth",
            "https://data-api.binance.vision/api/v3/depth",
        ]
        for url in endpoints:
            try:
                resp = requests.get(url, params={"symbol": raw_symbol, "limit": 20}, timeout=3)
                if not resp.ok:
                    continue
                d = resp.json()
                bids = sum(float(b[0]) * float(b[1]) for b in d.get("bids", []))
                asks = sum(float(a[0]) * float(a[1]) for a in d.get("asks", []))
                if asks > 0:
                    return round(bids / asks, 2)
            except Exception:
                pass
        return 1.0

    def _place_binance_tr_order(self, symbol: str, side: str, quantity: float, quote_qty: Optional[float] = None):
        api_key = self.settings.get("api_key", "").strip()
        api_secret = self.settings.get("api_secret", "").strip()
        if not api_key or not api_secret:
            raise RuntimeError("Binance TR API Key ve Secret girilmelidir!")

        tr_symbol = symbol.replace("/", "_").upper()
        timestamp = int(time.time() * 1000)
        params: Dict[str, Any] = {
            "symbol": tr_symbol,
            "side": 0 if side.upper() == "BUY" else 1,
            "type": 2,
            "timestamp": timestamp,
        }
        if side.upper() == "BUY" and quote_qty is not None:
            params["quoteOrderQty"] = round(quote_qty, 2)
        else:
            params["quantity"] = round(quantity, 6)

        query_string = urlencode(params)
        signature = hmac.new(
            api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        params["signature"] = signature

        headers = {"X-MBX-APIKEY": api_key}
        resp = requests.post(
            "https://www.trbinance.com/open/v1/orders",
            params=params,
            headers=headers,
            timeout=8,
        )
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Binance TR API Hatası: {data.get('msg', data)}")
        return data

    def fetch_all_tickers_stage1(self) -> Dict[str, Dict[str, float]]:
        endpoints = [
            "https://api.binance.me/api/v3/ticker/24hr",
            "https://data-api.binance.vision/api/v3/ticker/24hr",
        ]
        suffix = self.settings.get("quote_asset", "TRY").upper()
        for url in endpoints:
            try:
                resp = requests.get(url, timeout=5)
                if not resp.ok:
                    continue
                tickers = resp.json()
                for t in tickers:
                    raw = str(t.get("symbol", ""))
                    if raw.endswith(suffix):
                        base = raw[: -len(suffix)]
                        sym = f"{base}/{suffix}"
                        price = float(t.get("lastPrice", 0.0))
                        if price > 0:
                            self.live_tickers[sym] = {
                                "price": price,
                                "quoteVolume": float(t.get("quoteVolume", 0.0)),
                                "priceChangePercent": float(t.get("priceChangePercent", 0.0)),
                            }
                            if sym in self.scanner_data:
                                self.scanner_data[sym]["price"] = price
                            self.check_risk_for_symbol(sym, price)
                break
            except Exception:
                pass
        return self.live_tickers

    def fetch_top_binance_tr_symbols(self, limit: int = 60, quote_asset: str = "TRY") -> List[str]:
        self.fetch_all_tickers_stage1()
        suffix = quote_asset.upper()
        matching = [
            (sym, info["quoteVolume"])
            for sym, info in self.live_tickers.items()
            if sym.endswith(f"/{suffix}") and info["quoteVolume"] > 0
        ]
        if len(matching) >= 15:
            matching.sort(key=lambda x: x[1], reverse=True)
            return [x[0] for x in matching[:limit]]

        if suffix == "USDT":
            return [c.replace("/TRY", "/USDT") for c in BINANCE_TR_60_COINS[:limit] if not c.startswith("USDT/")]
        return BINANCE_TR_60_COINS[:limit]

    def fetch_candles(self, symbol: Optional[str] = None, timeframe: Optional[str] = None, limit: int = 75, force: bool = False) -> List[Dict[str, Any]]:
        sym = symbol or self.settings.get("symbol", "BTC/TRY")
        tf = timeframe or self.settings.get("timeframe", "15m")

        now = time.time()
        if not force and sym in self.candles_cache and (now - self.candles_ts.get(sym, 0)) < 35:
            cached = self.candles_cache[sym]
            if sym in self.live_tickers and cached:
                cached[-1]["close"] = self.live_tickers[sym]["price"]
            return cached

        raw_symbol = sym.replace("/", "").replace("_", "").upper()
        endpoints = [
            "https://api.binance.me/api/v3/klines",
            "https://data-api.binance.vision/api/v3/klines",
            "https://api4.binance.com/api/v3/klines",
        ]
        data = None
        last_err = None
        for base_url in endpoints:
            try:
                resp = requests.get(
                    base_url,
                    params={"symbol": raw_symbol, "interval": tf, "limit": limit},
                    timeout=5,
                )
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as err:
                last_err = err

        if data is None:
            raise RuntimeError(f"Binance TR veri sunucularına ulaşılamadı ({sym}): {last_err}")

        candles = [
            {
                "time": int(row[0] // 1000),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
            for row in data
        ]
        if candles:
            self.candles_cache[sym] = candles
            self.candles_ts[sym] = now
        return candles

    def update_market_regime(self):
        quote = self.settings.get("quote_asset", "TRY")
        btc_sym = f"BTC/{quote}"
        btc_scan = self.scanner_data.get(btc_sym)
        if not btc_scan:
            return

        ind = btc_scan.get("indicators", {})
        rsi = float(ind.get("rsi", 50.0))
        ef = float(ind.get("ema_fast", 0.0))
        es = float(ind.get("ema_slow", 0.0))
        is_up = ef >= es

        if is_up and rsi >= 48:
            self.market_regime = {
                "state": "BULL",
                "label": "🟢 BOĞA REJİMİ (RISK-ON)",
                "btc_rsi": rsi,
                "btc_trend": "POZİTİF",
                "max_pos_multiplier": 1.0,
            }
        elif not is_up and rsi < 38:
            self.market_regime = {
                "state": "BEAR",
                "label": "🔴 AYI KALKANI AKTİF (RISK-OFF)",
                "btc_rsi": rsi,
                "btc_trend": "NEGATİF (DÜŞÜŞ)",
                "max_pos_multiplier": 0.25,
            }
        else:
            self.market_regime = {
                "state": "NEUTRAL",
                "label": "🟡 SEÇİCİ / DENGELİ REJİM",
                "btc_rsi": rsi,
                "btc_trend": "Yükseliş" if is_up else "Zayıf",
                "max_pos_multiplier": 0.75,
            }

    def get_current_total_equity(self) -> float:
        fee_pct = float(self.settings.get("round_trip_fee_pct", 0.25))
        total_inv = 0.0
        total_upnl = 0.0
        for sym, pos in self.positions.items():
            cur_p = float(self.scanner_data.get(sym, {}).get("price") or pos.get("current_price") or pos["entry_price"])
            inv = float(pos["invested_usdt"])
            u_pct = (((cur_p - float(pos["entry_price"])) / float(pos["entry_price"])) * 100.0) - fee_pct
            total_inv += inv
            total_upnl += inv * (u_pct / 100.0)
        return self.paper_balance_usdt + total_inv + total_upnl

    def open_position(self, symbol: str, price: float, reason: str, custom_amount: Optional[float] = None, is_manual: bool = False):
        with self.lock:
            if symbol in self.positions:
                return
            if not is_manual and time.time() < self.cooldown_until.get(symbol, 0):
                return
            if not is_manual and time.time() < self.circuit_breaker_until:
                return
            max_pos = int(self.settings.get("max_open_positions", 8))
            if len(self.positions) >= max_pos:
                return

            # Emir Defteri Balina Duvarı (OBI) Son Kontrolü
            obi = 1.0
            if self.settings.get("use_obi_filter", True):
                obi = self.fetch_obi_ratio(symbol)
                if not is_manual and obi < 0.62:
                    self._log("WARN", f"🚫 SATIŞ DUVARI ENGELİ [{symbol}]: Tahta OBI={obi:.2f}x (Satıcılar baskın, alım iptal edildi).")
                    return

            quote = self.settings.get("quote_asset", "TRY")
            scan_info = self.scanner_data.get(symbol, {})
            ind = scan_info.get("indicators", {})

            # Otomatik Bileşik Kâr (Auto-Compounding)
            if custom_amount is not None:
                base_trade_amt = float(custom_amount)
            elif self.settings.get("use_auto_compound", True):
                eq = self.get_current_total_equity()
                base_trade_amt = round((eq / max(2, max_pos)) * 0.90, 2)
            else:
                base_trade_amt = float(self.settings.get("trade_amount_usdt", 1250.0))

            if custom_amount is None and self.settings.get("use_volatility_sizing", True):
                vol_mult = float(ind.get("vol_size_mult", 1.0))
                trade_amt = round(base_trade_amt * vol_mult, 2)
            else:
                trade_amt = base_trade_amt

            mode = self.settings.get("mode", "paper")

            if self.settings.get("use_atr_stops", True) and ind.get("dynamic_sl_pct"):
                sl_pct = max(1.6, float(ind["dynamic_sl_pct"]))
                tp_pct = max(2.8, float(ind["dynamic_tp_pct"]))
            else:
                sl_pct = max(1.6, float(self.settings.get("stop_loss_pct", 2.0)))
                tp_pct = max(2.8, float(self.settings.get("take_profit_pct", 4.5)))

            if mode == "paper":
                if self.paper_balance_usdt < trade_amt:
                    if self.paper_balance_usdt >= 100.0:
                        trade_amt = round(self.paper_balance_usdt, 2)
                    else:
                        return
                self.paper_balance_usdt -= trade_amt
            else:
                try:
                    qty_order = trade_amt / price
                    self._place_binance_tr_order(symbol, "BUY", qty_order, quote_qty=trade_amt)
                except Exception as e:
                    self._log("ERROR", f"Binance TR ALIM hatası ({symbol}): {e}")
                    return

            qty = trade_amt / price
            stop_loss = price * (1.0 - sl_pct / 100.0)
            take_profit = price * (1.0 + tp_pct / 100.0)

            self.positions[symbol] = {
                "symbol": symbol,
                "side": "LONG",
                "entry_price": price,
                "current_price": price,
                "highest_price": price,
                "qty": qty,
                "invested_usdt": trade_amt,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "sl_pct": round(sl_pct, 2),
                "tp_pct": round(tp_pct, 2),
                "atr_pct": ind.get("atr_pct", 1.5),
                "rvol": ind.get("rvol", 1.0),
                "obi": obi,
                "profit_locked": False,
                "partial_tp_done": False,
                "opened_ts": time.time(),
                "opened_at": datetime.now().strftime("%H:%M:%S"),
                "reason": reason,
                "mode": mode,
            }
            self._log(
                "BUY",
                f"QUANT v4 ALIM [{symbol}] @ {price:.4f} {quote} | Tutar: {trade_amt:.0f} {quote} (OBI: {obi:.2f}x) | {reason}",
            )

    def execute_partial_tp(self, symbol: str, price: float):
        """
        Kademeli Kâr Alma (%50 Scale-Out):
        Pozisyonun yarısını (%50) satıp net kârı kasaya kilitler, kalan %50'yi ralli için taşır.
        """
        with self.lock:
            pos = self.positions.get(symbol)
            if not pos or pos.get("partial_tp_done"):
                return
            quote = self.settings.get("quote_asset", "TRY")
            entry_price = float(pos["entry_price"])
            half_inv = round(float(pos["invested_usdt"]) * 0.50, 2)
            half_qty = float(pos["qty"]) * 0.50

            fee_pct = float(self.settings.get("round_trip_fee_pct", 0.25))
            gross_pct = ((price - entry_price) / entry_price) * 100.0
            net_pct = gross_pct - fee_pct
            fee_cost = half_inv * (fee_pct / 100.0)
            net_pnl = half_inv * (net_pct / 100.0)

            if pos.get("mode", "paper") == "paper":
                self.paper_balance_usdt += half_inv + net_pnl
            else:
                try:
                    self._place_binance_tr_order(symbol, "SELL", half_qty)
                except Exception as e:
                    self._log("ERROR", f"Kademeli satış hatası ({symbol}): {e}")
                    return

            self.total_fees_paid += fee_cost
            pos["invested_usdt"] = round(float(pos["invested_usdt"]) - half_inv, 2)
            pos["qty"] = float(pos["qty"]) - half_qty
            pos["partial_tp_done"] = True
            pos["profit_locked"] = True
            pos["stop_loss"] = max(float(pos["stop_loss"]), entry_price * (1.0 + (fee_pct + 0.45) / 100.0))

            trade_record = {
                "symbol": f"{symbol} (%50 TP1)",
                "mode": "QUANT v4",
                "entry_price": round(entry_price, 4),
                "exit_price": round(price, 4),
                "invested_usdt": half_inv,
                "fee_usdt": round(fee_cost, 2),
                "pnl_usdt": round(net_pnl, 2),
                "pnl_pct": round(net_pct, 2),
                "opened_at": pos["opened_at"],
                "closed_at": datetime.now().strftime("%H:%M:%S"),
                "reason": f"🎯 %50 Kademeli Kâr Alındı (+%{gross_pct:.2f})",
            }
            self.trades.insert(0, trade_record)
            self._save_trades()
            self._log(
                "PROFIT",
                f"🎯 %50 KADEMELİ KÂR [{symbol}] @ {price:.4f} {quote} | Kasaya Giren Net: {net_pnl:+.2f} {quote} (+%{net_pct:.2f}) | Kalan %50 Ralli İçin Taşınıyor!",
            )

    def close_position(self, symbol: str, price: float, reason: str):
        with self.lock:
            if symbol not in self.positions:
                return
            pos = self.positions[symbol]
            quote = self.settings.get("quote_asset", "TRY")
            entry_price = float(pos["entry_price"])
            qty = float(pos["qty"])
            invested = float(pos["invested_usdt"])
            mode = pos.get("mode", "paper")

            fee_pct = float(self.settings.get("round_trip_fee_pct", 0.25))
            gross_pnl_pct = ((price - entry_price) / entry_price) * 100.0
            net_pnl_pct = gross_pnl_pct - fee_pct
            fee_cost = invested * (fee_pct / 100.0)
            net_pnl_amt = invested * (net_pnl_pct / 100.0)
            self.total_fees_paid += fee_cost

            if mode == "paper":
                self.paper_balance_usdt += invested + net_pnl_amt
            else:
                try:
                    self._place_binance_tr_order(symbol, "SELL", qty)
                except Exception as e:
                    self._log("ERROR", f"Binance TR SATIŞ hatası ({symbol}): {e}")
                    return

            self.cooldown_until[symbol] = time.time() + 600

            trade_record = {
                "symbol": symbol,
                "mode": mode.upper(),
                "entry_price": round(entry_price, 4),
                "exit_price": round(price, 4),
                "invested_usdt": round(invested, 2),
                "fee_usdt": round(fee_cost, 2),
                "pnl_usdt": round(net_pnl_amt, 2),
                "pnl_pct": round(net_pnl_pct, 2),
                "opened_at": pos["opened_at"],
                "closed_at": datetime.now().strftime("%H:%M:%S"),
                "reason": reason,
            }
            self.trades.insert(0, trade_record)
            self._save_trades()
            del self.positions[symbol]

            tag = "PROFIT" if net_pnl_amt >= 0 else "LOSS"
            self._log(
                tag,
                f"QUANT SATIŞ [{symbol}] @ {price:.4f} {quote} | Net PnL: {net_pnl_amt:+.2f} {quote} ({net_pnl_pct:+.2f}%, Komisyon: -{fee_cost:.1f} {quote}) | {reason}",
            )

    def close_all_positions(self, custom_reason: str = "Tüm Portföy Nakde Çevrildi"):
        for sym in list(self.positions.keys()):
            price = self.scanner_data.get(sym, {}).get("price") or self.positions[sym]["current_price"]
            self.close_position(sym, float(price), custom_reason)

    def check_risk_for_symbol(self, symbol: str, current_price: float):
        if symbol not in self.positions or current_price <= 0:
            return
        pos = self.positions[symbol]
        pos["current_price"] = current_price
        entry = float(pos["entry_price"])
        fee_pct = float(self.settings.get("round_trip_fee_pct", 0.25))

        if current_price > pos["highest_price"]:
            pos["highest_price"] = current_price

        current_gain_pct = ((current_price - entry) / entry) * 100.0
        peak_gain_pct = ((pos["highest_price"] - entry) / entry) * 100.0

        # 1. Kademeli Kâr Alma (%50 Scale-Out)
        partial_target = float(self.settings.get("partial_tp_pct", 1.8))
        if self.settings.get("use_partial_tp", True) and not pos.get("partial_tp_done") and current_gain_pct >= partial_target:
            self.execute_partial_tp(symbol, current_price)
            if symbol not in self.positions:
                return
            pos = self.positions[symbol]

        # 2. Kâr Kilitlemeli (Break-Even Plus) Trailing Stop
        if self.settings.get("use_trailing_stop", True) and peak_gain_pct >= 1.20:
            breakeven_plus_price = entry * (1.0 + (fee_pct + 0.35) / 100.0)
            trail_dist_pct = 0.65 if peak_gain_pct >= 2.2 else 0.85
            trailed_price = pos["highest_price"] * (1.0 - trail_dist_pct / 100.0)
            new_sl = max(breakeven_plus_price, trailed_price)
            if new_sl > pos["stop_loss"]:
                pos["stop_loss"] = new_sl
                if not pos.get("profit_locked"):
                    pos["profit_locked"] = True
                    self._log("INFO", f"🔒 KÂR KİLİTLENDİ [{symbol}]: Stop-Loss {new_sl:.4f} seviyesine çekildi.")

        if current_price <= pos["stop_loss"]:
            reason_lbl = (
                f"Kâr Kilidi (Trailing Profit) @ {pos['stop_loss']:.4f}"
                if pos.get("profit_locked")
                else f"ATR Stop-Loss @ {pos['stop_loss']:.4f}"
            )
            self.close_position(symbol, current_price, reason_lbl)
        elif current_price >= pos["take_profit"]:
            self.close_position(symbol, current_price, f"ATR Take-Profit Hedefi ({pos['take_profit']:.4f})")

    def check_daily_circuit_breaker(self):
        if not self.settings.get("use_circuit_breaker", True):
            return
        init_bal = float(self.settings.get("initial_paper_balance", 10000.0))
        eq = self.get_current_total_equity()
        net_pct = ((eq - init_bal) / init_bal) * 100.0
        tp_lim = float(self.settings.get("daily_tp_limit_pct", 8.0))
        sl_lim = float(self.settings.get("daily_sl_limit_pct", 4.0))

        if net_pct >= tp_lim and self.positions:
            self._log("PROFIT", f"🏆 GÜNLÜK KÂR SİGORTASI (+%{net_pct:.2f} >= +%{tp_lim:.1f}): Tüm kâr nakde kilitleniyor!")
            self.close_all_positions("🏆 Günlük Kâr Hedefi Sigortası")
            self.running = False
        elif net_pct <= -sl_lim and time.time() > self.circuit_breaker_until:
            self.circuit_breaker_until = time.time() + 1800
            self._log("WARN", f"🛡️ ZARAR KESİCİ SİGORTA ({net_pct:.2f}%): Yeni alımlar 30 dakika duraklatıldı.")

    def _scan_single_coin(self, sym: str, tf: str) -> Optional[Dict[str, Any]]:
        try:
            candles = self.fetch_candles(sym, tf, limit=75)
            if not candles:
                return None
            price = candles[-1]["close"]
            ev = evaluate_strategy(candles, self.settings, obi_ratio=1.0)
            return {
                "symbol": sym,
                "price": price,
                "signal": ev["signal"],
                "score": ev.get("score", 50),
                "reason": ev["reason"],
                "indicators": ev["indicators"],
                "series": ev["series"],
            }
        except Exception:
            return None

    def step(self) -> Dict[str, Any]:
        self.fetch_all_tickers_stage1()

        scan_limit = int(self.settings.get("scan_limit", 60))
        quote = self.settings.get("quote_asset", "TRY")
        coins = self.settings.get("portfolio_coins", BINANCE_TR_60_COINS)
        if len(coins) != scan_limit:
            coins = self.fetch_top_binance_tr_symbols(limit=scan_limit, quote_asset=quote)
            self.settings["portfolio_coins"] = coins

        tf = self.settings.get("timeframe", "15m")

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(self._scan_single_coin, sym, tf): sym for sym in coins}
            for fut in as_completed(futures):
                res = fut.result()
                if res:
                    sym = res["symbol"]
                    self.scanner_data[sym] = res
                    self.check_risk_for_symbol(sym, res["price"])

        self.update_market_regime()
        self.check_daily_circuit_breaker()

        if self.running:
            for sym in list(self.positions.keys()):
                sc = self.scanner_data.get(sym)
                pos = self.positions.get(sym)
                if sc and pos and sc["signal"] == "SELL":
                    gross_pct = ((sc["price"] - pos["entry_price"]) / pos["entry_price"]) * 100.0
                    if gross_pct >= 0.85 or sc.get("score", 50) <= 24:
                        self.close_position(sym, sc["price"], f"Onaylı İndikatör Çıkışı: {sc['reason']}")

            regime_state = self.market_regime.get("state", "NEUTRAL")
            use_regime = self.settings.get("use_regime_filter", True)
            max_pos = int(self.settings.get("max_open_positions", 8))

            if use_regime and regime_state == "BEAR":
                effective_max_pos = max(1, int(max_pos * 0.25))
                min_buy_score = 78
            elif use_regime and regime_state == "NEUTRAL":
                effective_max_pos = max(2, int(max_pos * 0.75))
                min_buy_score = 70
            else:
                effective_max_pos = max_pos
                min_buy_score = 68

            now_ts = time.time()
            ranked_buys = sorted(
                [
                    s
                    for s in self.scanner_data.values()
                    if s["symbol"] not in self.positions
                    and now_ts >= self.cooldown_until.get(s["symbol"], 0)
                    and s.get("score", 0) >= min_buy_score
                    and bool(s.get("indicators", {}).get("is_bullish_candle", True))
                    and float(s.get("indicators", {}).get("rvol", 1.0)) >= 0.80
                ],
                key=lambda x: x.get("score", 0),
                reverse=True,
            )
            for item in ranked_buys:
                if len(self.positions) >= effective_max_pos:
                    break
                self.open_position(item["symbol"], item["price"], item["reason"])

        eq_now = round(self.get_current_total_equity(), 2)
        self.last_update_ts = datetime.now().strftime("%H:%M:%S")
        self.equity_history.append({"time": self.last_update_ts, "equity": eq_now})
        if len(self.equity_history) > 80:
            self.equity_history = self.equity_history[-80:]

        self._save_portfolio_state()
        return self.get_status()

    def auto_build_portfolio(self) -> Dict[str, Any]:
        self.step()
        max_pos = int(self.settings.get("max_open_positions", 8))
        ranked = sorted(
            [
                c
                for c in self.scanner_data.values()
                if c["symbol"] not in self.positions
                and c.get("price", 0) > 0
                and c.get("score", 0) >= 62
                and bool(c.get("indicators", {}).get("is_bullish_candle", True))
                and float(c.get("indicators", {}).get("rvol", 1.0)) >= 0.75
            ],
            key=lambda x: x.get("score", 0),
            reverse=True,
        )
        slots_available = max_pos - len(self.positions)
        if slots_available <= 0:
            self._log("INFO", f"Portföy zaten dolu ({len(self.positions)}/{max_pos} coin).")
            return self.get_status()

        selected = ranked[:slots_available]
        if not selected:
            self._log("WARN", "Şu an yüksek kaliteli (Skor >= 62 & Yeşil Dönüş Onaylı) coin bulunamadı; nakit korunuyor.")
            return self.get_status()

        for item in selected:
            self.open_position(
                item["symbol"],
                float(item["price"]),
                f"Quant v4 Seçici Sepet (Skor: {item.get('score', 50)}/100)",
            )

        self._log("INFO", f"Quant v4 Seçici Portföy: Yüksek beklentili {len(selected)} coin sepete eklendi.")
        return self.get_status()

    def _loop(self):
        while self.running:
            try:
                self.step()
            except Exception as e:
                self._log("ERROR", f"Portföy döngü hatası: {e}")
            interval = max(4, int(self.settings.get("poll_interval_sec", 7)))
            for _ in range(interval * 2):
                if not self.running:
                    break
                time.sleep(0.5)

    def start(self):
        if self.running:
            return
        self.running = True
        self._save_portfolio_state()
        self._log(
            "INFO",
            f"Quant v4.0 Portföy Botu BAŞLATILDI ({len(self.settings.get('portfolio_coins', []))} Coin Taranıyor)",
        )
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        self._save_portfolio_state()
        self._log("INFO", "Bot DURDURULDU.")

    def update_settings(self, new_data: Dict[str, Any]) -> Dict[str, Any]:
        old_quote = self.settings.get("quote_asset", "TRY")
        old_limit = int(self.settings.get("scan_limit", 60))
        self.settings = save_settings(new_data)
        new_quote = self.settings.get("quote_asset", "TRY")
        new_limit = int(self.settings.get("scan_limit", 60))
        if new_quote != old_quote or new_limit != old_limit:
            self.settings["portfolio_coins"] = self.fetch_top_binance_tr_symbols(limit=new_limit, quote_asset=new_quote)
            self.settings["symbol"] = f"BTC/{new_quote}"
            self.scanner_data.clear()
            self.candles_ts.clear()
        self._log("INFO", f"Quant v4.0 Ayarları güncellendi ({new_limit} Coin)")
        return self.settings

    def get_status(self) -> Dict[str, Any]:
        active_sym = self.settings.get("symbol", "BTC/TRY")
        active_scan = self.scanner_data.get(active_sym, {})
        active_candles = self.candles_cache.get(active_sym, [])

        total_closed_pnl = sum(float(t.get("pnl_usdt", 0.0)) for t in self.trades)
        wins = sum(1 for t in self.trades if float(t.get("pnl_usdt", 0.0)) > 0)
        win_rate = (wins / len(self.trades) * 100.0) if self.trades else 0.0

        fee_pct = float(self.settings.get("round_trip_fee_pct", 0.25))
        positions_list = []
        total_invested = 0.0
        total_unrealized_pnl = 0.0

        for sym, pos in self.positions.items():
            cur_price = float(self.scanner_data.get(sym, {}).get("price") or pos.get("current_price") or pos["entry_price"])
            entry = float(pos["entry_price"])
            inv = float(pos["invested_usdt"])
            u_pct = (((cur_price - entry) / entry) * 100.0) - fee_pct
            u_pnl = inv * (u_pct / 100.0)
            total_invested += inv
            total_unrealized_pnl += u_pnl
            pos_copy = dict(pos)
            pos_copy["current_price"] = cur_price
            pos_copy["unrealized_pnl"] = round(u_pnl, 2)
            pos_copy["unrealized_pct"] = round(u_pct, 2)
            pos_copy["current_value"] = round(inv + u_pnl, 2)
            positions_list.append(pos_copy)

        total_equity = self.paper_balance_usdt + total_invested + total_unrealized_pnl

        scanner_list = []
        for sym in self.settings.get("portfolio_coins", BINANCE_TR_60_COINS):
            item = self.scanner_data.get(sym, {"symbol": sym, "price": 0, "signal": "HOLD", "score": 50, "reason": "Taranıyor...", "indicators": {}})
            scanner_list.append({
                "symbol": sym,
                "price": item.get("price", 0),
                "signal": item.get("signal", "HOLD"),
                "score": item.get("score", 50),
                "reason": item.get("reason", ""),
                "indicators": item.get("indicators", {}),
                "in_position": sym in self.positions,
            })

        safe_settings = {k: v for k, v in self.settings.items() if k not in ("api_secret",)}

        return {
            "running": self.running,
            "last_update": self.last_update_ts,
            "symbol": active_sym,
            "quote_asset": self.settings.get("quote_asset", "TRY"),
            "market_regime": self.market_regime,
            "total_fees_paid": round(self.total_fees_paid, 2),
            "price": active_scan.get("price", 0.0),
            "cash_usdt": round(self.paper_balance_usdt, 2),
            "invested_usdt": round(total_invested, 2),
            "unrealized_pnl": round(total_unrealized_pnl, 2),
            "total_equity_usdt": round(total_equity, 2),
            "total_pnl_usdt": round(total_closed_pnl + total_unrealized_pnl, 2),
            "closed_pnl_usdt": round(total_closed_pnl, 2),
            "win_rate": round(win_rate, 1),
            "trade_count": len(self.trades),
            "positions": positions_list,
            "scanner": scanner_list,
            "equity_history": self.equity_history,
            "evaluation": {
                "signal": active_scan.get("signal", "HOLD"),
                "score": active_scan.get("score", 50),
                "reason": active_scan.get("reason", ""),
                "indicators": active_scan.get("indicators", {}),
            },
            "candles": active_candles[-90:],
            "series": {
                k: v[-90:] for k, v in active_scan.get("series", {}).items()
            },
            "trades": self.trades[:50],
            "logs": self.logs[:60],
            "settings": safe_settings,
        }
