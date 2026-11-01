import os
import time
import threading
from pathlib import Path
from typing import Dict, Any
import requests
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

from bot_engine import TradingBotEngine

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Argon Quantum OS v4.0 // 24/7 Cloud Portfolio Engine", version="4.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bot = TradingBotEngine()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _keep_alive_worker():
    """Bulut sunucusunun (Render / HuggingFace) uyku moduna geçmesini önleyen 7/24 Keep-Alive döngüsü."""
    while True:
        time.sleep(240)
        ext_url = os.environ.get("RENDER_EXTERNAL_URL") or (
            f"https://{os.environ['SPACE_HOST']}" if os.environ.get("SPACE_HOST") else None
        )
        if ext_url:
            try:
                requests.get(f"{ext_url.rstrip('/')}/api/ping", timeout=5)
            except Exception:
                pass


threading.Thread(target=_keep_alive_worker, daemon=True).start()


@app.get("/")
def serve_index():
    return FileResponse(str(STATIC_DIR / "index.html"), headers={"Cache-Control": "no-store"})


@app.get("/style.css")
def serve_css():
    return FileResponse(str(STATIC_DIR / "style.css"), headers={"Cache-Control": "no-store"})


@app.get("/app.js")
def serve_js():
    return FileResponse(str(STATIC_DIR / "app.js"), headers={"Cache-Control": "no-store"})


@app.get("/api/ping")
def ping():
    return {"ok": True, "running": bot.running, "open_positions": len(bot.positions)}


@app.get("/api/status")
def get_status():
    if not bot.scanner_data:
        try:
            bot.step()
        except Exception as e:
            bot._log("WARN", f"İlk veri çekme hatası: {e}")
    return JSONResponse(bot.get_status())


@app.post("/api/sync-state")
def sync_state(payload: Dict[str, Any] = Body(...)):
    return JSONResponse(bot.sync_from_client(payload))


@app.post("/api/refresh")
def refresh_market():
    return JSONResponse(bot.step())


@app.post("/api/start")
def start_bot():
    bot.start()
    return JSONResponse(bot.get_status())


@app.post("/api/stop")
def stop_bot():
    bot.stop()
    return JSONResponse(bot.get_status())


@app.post("/api/settings")
def update_settings(payload: Dict[str, Any] = Body(...)):
    bot.update_settings(payload)
    try:
        bot.step()
    except Exception:
        pass
    return JSONResponse(bot.get_status())


@app.post("/api/auto-portfolio")
def auto_portfolio():
    return JSONResponse(bot.auto_build_portfolio())


@app.post("/api/manual-buy")
def manual_buy(payload: Dict[str, Any] = Body(default={})):
    sym = payload.get("symbol") or bot.settings.get("symbol", "BTC/TRY")
    if sym not in bot.scanner_data:
        bot.step()
    price = float(bot.scanner_data.get(sym, {}).get("price", 0.0))
    if price > 0:
        bot.open_position(sym, price, "Kullanıcı Manuel Alım Emri")
    return JSONResponse(bot.get_status())


@app.post("/api/manual-sell")
def manual_sell(payload: Dict[str, Any] = Body(default={})):
    sym = payload.get("symbol") or bot.settings.get("symbol", "BTC/TRY")
    price = float(bot.scanner_data.get(sym, {}).get("price", 0.0))
    if price > 0:
        bot.close_position(sym, price, "Kullanıcı Manuel Satış Emri")
    return JSONResponse(bot.get_status())


@app.post("/api/close-all")
def close_all():
    bot.close_all_positions()
    return JSONResponse(bot.get_status())


@app.post("/api/reset-paper")
def reset_paper():
    bot.running = False
    bot.positions.clear()
    bot.trades.clear()
    bot.total_fees_paid = 0.0
    bot.cooldown_until.clear()
    bot.equity_history.clear()
    bot._save_trades()
    bot.paper_balance_usdt = float(bot.settings.get("initial_paper_balance", 10000.0))
    bot._save_portfolio_state()
    bot._log("INFO", f"Portföy, işlem geçmişi ve komisyon sayacı tamamen sıfırlandı ({bot.paper_balance_usdt:.2f} nakit).")
    return JSONResponse(bot.get_status())


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    print("=" * 60)
    print(f" ARGON QUANTUM OS v4.0 7/24 BULUT MOTORU BAŞLATILIYOR (Port: {port})...")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=port)

import threading
import bot_engine

@app.on_event('startup')
def start_render_daemon():
    print('Starting 24/7 Render Cloud Daemon Thread...')
    th = threading.Thread(target=bot_engine.run_loop, daemon=True)
    th.start()
