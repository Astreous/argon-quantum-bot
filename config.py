import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
CONFIG_FILE = BASE_DIR / "bot_settings.json"

BINANCE_TR_60_COINS = [
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
]

DEFAULT_SETTINGS = {
    "exchange": "binance_tr",
    "quote_asset": "TRY",
    "mode": "paper",
    "market_type": "spot",
    "symbol": "BTC/TRY",
    "scan_limit": 60,
    "portfolio_coins": BINANCE_TR_60_COINS,
    "max_open_positions": 8,
    "timeframe": "15m",
    "strategy": "multi",
    "trade_amount_usdt": 1250.0,
    "initial_paper_balance": 10000.0,
    "leverage": 1,
    # Quant v4.0 Parametreleri
    "use_atr_stops": True,
    "atr_sl_mult": 2.0,
    "atr_tp_mult": 3.8,
    "use_volatility_sizing": True,
    "use_regime_filter": True,
    "use_trailing_stop": True,
    "use_partial_tp": True,         # %50 Kademeli Kâr Alma (Scale-Out)
    "partial_tp_pct": 1.8,          # +%1.80 kârda pozisyonun %50'sini nakde çevir
    "use_mtf_filter": True,         # Çoklu Zaman Dilimi (Üst Trend EMA50) Onayı
    "use_obi_filter": True,         # Emir Defteri Balina Duvarı (Order Book Imbalance) Analizi
    "use_auto_compound": True,      # Otomatik Bileşik Kâr (Portföy büyüdükçe alım tutarını büyüt)
    "use_circuit_breaker": True,    # Günlük Kâr/Zarar Sigortası
    "daily_tp_limit_pct": 8.0,      # Günlük +%8 net kârda sigorta kârı kilitler
    "daily_sl_limit_pct": 4.0,      # Günlük -%4 zararda yeni alımları durdurur
    "round_trip_fee_pct": 0.25,
    "stop_loss_pct": 2.0,
    "take_profit_pct": 4.5,
    "trailing_stop_pct": 1.0,
    "rsi_period": 14,
    "rsi_oversold": 35,
    "rsi_overbought": 68,
    "ema_fast": 9,
    "ema_slow": 21,
    "macd_fast": 12,
    "macd_slow": 26,
    "macd_signal": 9,
    "bb_period": 20,
    "bb_std": 2.0,
    "poll_interval_sec": 7,
    "api_key": os.getenv("BINANCE_TR_API_KEY", ""),
    "api_secret": os.getenv("BINANCE_TR_API_SECRET", ""),
}


def load_settings() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                merged = {**DEFAULT_SETTINGS, **saved}
                if not merged.get("portfolio_coins") or len(merged.get("portfolio_coins", [])) < 15:
                    merged["portfolio_coins"] = BINANCE_TR_60_COINS.copy()
                return merged
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(new_settings: dict) -> dict:
    current = load_settings()
    current.update(new_settings)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
    return current
