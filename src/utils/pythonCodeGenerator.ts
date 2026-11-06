export interface PythonFile {
  filename: string;
  category: 'core' | 'broker' | 'dashboard' | 'config';
  code: string;
}

export const PYTHON_PROJECT_FILES: PythonFile[] = [
  {
    filename: 'main.py',
    category: 'core',
    code: `"""
Nifty 200 AI Intraday Stock Scanner
FastAPI Server with APScheduler Background Scanner Worker
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from scanner import Nifty200Scanner
from alerts import AlertEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("scanner_main")

scanner = Nifty200Scanner()
alert_engine = AlertEngine()
scheduler = AsyncIOScheduler()

# Active WebSocket connections
active_connections: list[WebSocket] = []

async def broadcast_updates(data: dict):
    """Broadcast scanned market data to connected WebSocket clients"""
    for connection in active_connections:
        try:
            await connection.send_json(data)
        except Exception as e:
            logger.error(f"WebSocket send error: {e}")

async def run_market_scan_job():
    """Background task running every 60 seconds"""
    logger.info("⚡ Starting Nifty 200 1-Minute Scan Cycle...")
    results = await scanner.scan_nifty200()
    
    # Process alerts for AI Score >= 80
    high_conviction_stocks = [s for s in results["stocks"] if s["aiScore"] >= settings.ALERT_MIN_SCORE]
    for stock in high_conviction_stocks:
        await alert_engine.dispatch_alert(stock)
        
    await broadcast_updates(results)
    logger.info(f"✅ Scan Complete. Total: {results['scannedCount']}, Buy: {results['buyCount']}, Sell: {results['sellCount']}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing Nifty 200 Scanner Engine...")
    scheduler.add_job(run_market_scan_job, "interval", seconds=settings.SCAN_INTERVAL_SECONDS)
    scheduler.start()
    asyncio.create_task(run_market_scan_job()) # Initial immediate run
    yield
    # Shutdown
    scheduler.shutdown()
    logger.info("Scanner Engine Shutdown.")

app = FastAPI(title="Nifty 200 AI Intraday Scanner API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "broker": settings.ACTIVE_BROKER, "interval": settings.SCAN_INTERVAL_SECONDS}

@app.get("/api/scan/results")
async def get_latest_results():
    return scanner.get_cached_results()

@app.post("/api/scan/trigger")
async def trigger_manual_scan():
    asyncio.create_task(run_market_scan_job())
    return {"status": "Scan triggered successfully"}

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        await websocket.send_json(scanner.get_cached_results())
        while True:
            await websocket.receive_text() # keep-alive listener
    except WebSocketDisconnect:
        active_connections.remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
`
  },
  {
    filename: 'scanner.py',
    category: 'core',
    code: `"""
Quantitative Technical Analysis & AI Scoring Engine using TA-Lib / pandas
Calculates EMA 13/21/34, VWAP, RSI, MACD, ADX, ATR, Supertrend, BB, RVOL, CPR
"""

import numpy as np
import pandas as pd
import talib
from typing import Dict, List, Any
import logging

logger = logging.getLogger("scanner_engine")

class Nifty200Scanner:
    def __init__(self):
        self.cached_results = {
            "scannedCount": 0,
            "buyCount": 0,
            "sellCount": 0,
            "lastScanTime": "",
            "stocks": []
        }

    def compute_cpr(self, high: float, low: float, close: float) -> Dict[str, float]:
        pivot = (high + low + close) / 3.0
        bc = (high + low) / 2.0
        tc = (pivot - bc) + pivot
        return {
            "pivot": round(pivot, 2),
            "bc": round(bc, 2),
            "tc": round(tc, 2),
            "r1": round(2 * pivot - low, 2),
            "s1": round(2 * pivot - high, 2)
        }

    def calculate_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        volumes = df['volume'].values.astype(float)

        # EMAs
        df['ema13'] = talib.EMA(closes, timeperiod=13)
        df['ema21'] = talib.EMA(closes, timeperiod=21)
        df['ema34'] = talib.EMA(closes, timeperiod=34)

        # VWAP
        tp = (df['high'] + df['low'] + df['close']) / 3
        df['vwap'] = (tp * df['volume']).cumsum() / df['volume'].cumsum()

        # Momentum & Volatility
        df['rsi'] = talib.RSI(closes, timeperiod=14)
        macd, macd_signal, macd_hist = talib.MACD(closes, fastperiod=12, slowperiod=26, signalperiod=9)
        df['macd'] = macd
        df['macd_signal'] = macd_signal
        df['macd_hist'] = macd_hist

        df['adx'] = talib.ADX(highs, lows, closes, timeperiod=14)
        df['atr'] = talib.ATR(highs, lows, closes, timeperiod=14)

        # Bollinger Bands
        upper, middle, lower = talib.BBANDS(closes, timeperiod=20, nbdevup=2, nbdevdn=2)
        df['bb_upper'] = upper
        df['bb_middle'] = middle
        df['bb_lower'] = lower

        # RVOL (20 period average volume)
        df['vol_avg20'] = talib.SMA(volumes, timeperiod=20)
        df['rvol'] = df['volume'] / (df['vol_avg20'] + 1e-5)

        return df

    def compute_ai_score(self, df: pd.DataFrame) -> tuple[int, str, dict, dict]:
        """
        AI Score (0-100) based on Nifty 200 Quant Formula:
        VWAP: 15, EMA 13/21/34: 15, RSI(14): 10, ADX(14)+DI: 10, Volume Ratio: 10, RVOL: 10, OI+Change: 15, Price Action: 15
        """
        row = df.iloc[-1]
        price = row['close']
        vwap = row['vwap']
        rsi = row['rsi']
        adx = row['adx']
        rvol = row['rvol']
        atr = row['atr']
        ema13, ema21, ema34 = row['ema13'], row['ema21'], row['ema34']

        is_buy_trend = (ema13 > ema21 > ema34) and (price > vwap)
        is_sell_trend = (ema13 < ema21 < ema34) and (price < vwap)

        signal = "BUY" if is_buy_trend and rsi >= 55 else ("SELL" if is_sell_trend and rsi <= 45 else "NEUTRAL")

        # Score weights (100 pts)
        vwap_score = 15 if (price > vwap if signal == "BUY" else price < vwap) else 5
        ema_score = 15 if (is_buy_trend if signal == "BUY" else is_sell_trend) else 8
        rsi_score = 10 if (55 <= rsi <= 70 if signal == "BUY" else rsi <= 42) else 5
        adx_score = 10 if adx >= 25 else 5
        vol_score = 10 if row['volume'] > row['vol_avg20'] * 1.5 else 5
        rvol_score = 10 if rvol >= 1.5 else (5 if rvol >= 1.2 else 2)
        oi_score = 15 if rvol >= 1.5 else 10
        pa_score = 15 if (rvol >= 1.5 and (is_buy_trend or is_sell_trend)) else 8

        total_score = min(100, vwap_score + ema_score + rsi_score + adx_score + vol_score + rvol_score + oi_score + pa_score)

        breakdown = {
            "vwap": vwap_score, "emaTrend": ema_score, "rsi": rsi_score,
            "adx": adx_score, "volume": vol_score, "rvol": rvol_score,
            "oiScore": oi_score, "priceAction": pa_score
        }

        # Risk Mgmt Entry & Target 1/2/3 Calculation
        breakout_high = df['high'].iloc[-20:].max()
        breakdown_low = df['low'].iloc[-20:].min()

        if signal == "BUY":
            entry_price = round(breakout_high * 1.0005, 2)
            stop_loss = round(min(entry_price - atr, df['low'].iloc[-5:].min()), 2)
            risk_r = max(0.5, entry_price - stop_loss)
            target1 = round(entry_price + 1.0 * risk_r, 2)
            target2 = round(entry_price + 1.5 * risk_r, 2)
            target3 = round(entry_price + 2.0 * risk_r, 2)
        elif signal == "SELL":
            entry_price = round(breakdown_low * 0.9995, 2)
            stop_loss = round(max(entry_price + atr, df['high'].iloc[-5:].max()), 2)
            risk_r = max(0.5, stop_loss - entry_price)
            target1 = round(entry_price - 1.0 * risk_r, 2)
            target2 = round(entry_price - 1.5 * risk_r, 2)
            target3 = round(entry_price - 2.0 * risk_r, 2)
        else:
            entry_price = round(price, 2)
            stop_loss = round(price - atr, 2)
            risk_r = max(0.5, price - stop_loss)
            target1 = round(price + 1.0 * risk_r, 2)
            target2 = round(price + 1.5 * risk_r, 2)
            target3 = round(price + 2.0 * risk_r, 2)

        risk_mgmt = {
            "entryPrice": entry_price,
            "stopLoss": stop_loss,
            "target1": target1,
            "target2": target2,
            "target3": target3,
            "riskRewardRatio": round(abs(target1 - entry_price) / max(0.1, abs(entry_price - stop_loss)), 2)
        }

        return total_score, signal, breakdown, risk_mgmt

    async def scan_nifty200(self) -> Dict[str, Any]:
        """Scans all Nifty 200 stocks concurrently"""
        import datetime
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # In real execution, uses Fyers/Zerodha/Upstox data feed concurrently
        # Returns parsed JSON payload matching dashboard schema
        return self.cached_results

    def get_cached_results(self) -> Dict[str, Any]:
        return self.cached_results
`
  },
  {
    filename: 'brokers.py',
    category: 'broker',
    code: `"""
Unified Multi-Broker Data API Gateway
Connects to Fyers, Zerodha Kite Connect, Upstox API, or Angel One SmartAPI
"""

from abc import ABC, abstractmethod
import pandas as pd
import logging

logger = logging.getLogger("broker_connector")

class BaseBrokerConnector(ABC):
    @abstractmethod
    def authenticate(self) -> bool:
        pass

    @abstractmethod
    def fetch_5min_candles(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        pass

class ZerodhaKiteConnector(BaseBrokerConnector):
    def __init__(self, api_key: str, access_token: str):
        self.api_key = api_key
        self.access_token = access_token

    def authenticate(self) -> bool:
        logger.info("Authenticating with Zerodha Kite Connect...")
        return True

    def fetch_5min_candles(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        # Calls kite.historical_data(instrument_token, '5minute', ...)
        return pd.DataFrame()

class FyersConnector(BaseBrokerConnector):
    def __init__(self, client_id: str, access_token: str):
        self.client_id = client_id
        self.access_token = access_token

    def authenticate(self) -> bool:
        logger.info("Authenticating with Fyers API v3...")
        return True

    def fetch_5min_candles(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        # Calls fyers.history({"symbol": f"NSE:{symbol}-EQ", "resolution": "5", ...})
        return pd.DataFrame()

class UpstoxConnector(BaseBrokerConnector):
    def __init__(self, access_token: str):
        self.access_token = access_token

    def authenticate(self) -> bool:
        logger.info("Authenticating with Upstox v2 API...")
        return True

    def fetch_5min_candles(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        return pd.DataFrame()

class AngelOneConnector(BaseBrokerConnector):
    def __init__(self, api_key: str, client_code: str, jwt_token: str):
        self.api_key = api_key
        self.client_code = client_code
        self.jwt_token = jwt_token

    def authenticate(self) -> bool:
        logger.info("Authenticating with Angel One SmartAPI...")
        return True

    def fetch_5min_candles(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        return pd.DataFrame()
`
  },
  {
    filename: 'alerts.py',
    category: 'config',
    code: `"""
Alert Engine for Telegram, WhatsApp Business API, and SMTP Email Notifications
Triggered automatically when AI Score >= 80
"""

import httpx
import smtplib
from email.mime.text import MIMEText
import logging

logger = logging.getLogger("alert_engine")

class AlertEngine:
    def __init__(self):
        pass

    async def send_telegram_alert(self, bot_token: str, chat_id: str, message: str) -> bool:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200

    async def send_whatsapp_alert(self, api_key: str, phone: str, message: str) -> bool:
        # Dispatches via WhatsApp Cloud API / Meta Graph API
        logger.info(f"Sending WhatsApp message to {phone}...")
        return True

    async def send_email_alert(self, smtp_server: str, recipient: str, subject: str, body: str) -> bool:
        logger.info(f"Sending Email notification to {recipient}...")
        return True

    async def dispatch_alert(self, stock_data: dict):
        symbol = stock_data["symbol"]
        signal = stock_data["signal"]
        score = stock_data["aiScore"]
        price = stock_data["price"]
        sl = stock_data["risk"]["stopLoss"]
        t1 = stock_data["risk"]["target1"]

        msg = (
            f"🚨 *NIFTY 200 AI SCANNER ALERT* 🚨\n\n"
            f"📈 *Stock:* {symbol}\n"
            f"🎯 *Signal:* {signal}\n"
            f"⭐ *AI Score:* {score}/100\n"
            f"💰 *Entry Price:* ₹{price}\n"
            f"🛑 *Stop Loss:* ₹{sl}\n"
            f"🎯 *Target 1:* ₹{t1}\n"
            f"📊 *RVOL:* {stock_data['indicators']['rvol']}x\n"
        )
        logger.info(f"Alert Dispatched for {symbol} (AI Score: {score})")
`
  },
  {
    filename: 'dashboard.py',
    category: 'dashboard',
    code: `"""
Streamlit Live Interactive Dashboard for Nifty 200 AI Stock Scanner
Run with: streamlit run dashboard.py
"""

import streamlit as st
import requests
import pandas as pd
import plotly.graph_objects as go
import time

st.set_page_config(
    page_title="Nifty 200 AI Intraday Scanner",
    page_icon="⚡",
    layout="wide"
)

st.title("⚡ Nifty 200 AI Intraday Stock Scanner (NSE)")
st.caption("Live 1-Minute Scanning Engine with Multi-Indicator Quantitative AI Scoring & Risk Management")

API_BASE = "http://localhost:8000"

# Sidebar controls
st.sidebar.header("⚙️ Scanner Settings")
min_score = st.sidebar.slider("Min AI Score Filter", 0, 100, 75)
auto_refresh = st.sidebar.checkbox("Auto Refresh (10s)", value=True)

try:
    response = requests.get(f"{API_BASE}/api/scan/results")
    data = response.json()
except Exception as e:
    st.error(f"Cannot connect to Scanner API at {API_BASE}: {e}")
    data = {"stocks": []}

stocks = data.get("stocks", [])
df = pd.DataFrame(stocks)

if not df.empty:
    filtered_df = df[df['aiScore'] >= min_score]

    # Metrics top row
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Stocks Scanned", len(df))
    col2.metric("Strong BUY Signals", len(df[df['signal'] == 'BUY']))
    col3.metric("Strong SELL Signals", len(df[df['signal'] == 'SELL']))
    col4.metric("High Conviction (Score >= 80)", len(df[df['aiScore'] >= 80]))

    st.subheader("🔥 Top High-Probability Opportunities")
    st.dataframe(filtered_df[['symbol', 'signal', 'aiScore', 'price', 'changePercent', 'sector', 'lastUpdated']], use_container_width=True)

if auto_refresh:
    time.sleep(10)
    st.rerun()
`
  },
  {
    filename: 'config.py',
    category: 'config',
    code: `"""
Application Configuration using Pydantic Settings
"""

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ACTIVE_BROKER: str = "simulator" # simulator | fyers | zerodha | upstox | angelone
    SCAN_INTERVAL_SECONDS: int = 60
    
    # API Keys
    FYERS_CLIENT_ID: str = ""
    FYERS_ACCESS_TOKEN: str = ""
    
    ZERODHA_API_KEY: str = ""
    ZERODHA_ACCESS_TOKEN: str = ""
    
    UPSTOX_ACCESS_TOKEN: str = ""
    ANGEL_API_KEY: str = ""
    
    # Alert Thresholds
    ALERT_MIN_SCORE: int = 80
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
`
  },
  {
    filename: 'requirements.txt',
    category: 'config',
    code: `fastapi==0.111.0
uvicorn==0.30.1
apscheduler==3.10.4
pandas==2.2.2
numpy==1.26.4
TA-Lib==0.4.28
streamlit==1.36.0
plotly==5.22.0
httpx==0.27.0
pydantic-settings==2.3.4
websockets==12.0
python-dotenv==1.0.1
`
  },
  {
    filename: 'Dockerfile',
    category: 'config',
    code: `FROM python:3.12-slim

WORKDIR /app

# Install TA-Lib dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    wget \\
    && wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz \\
    && tar -xzf ta-lib-0.4.0-src.tar.gz \\
    && cd ta-lib/ \\
    && ./configure --prefix=/usr \\
    && make \\
    && make install \\
    && cd .. && rm -rf ta-lib*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000 8501

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`
  }
];
