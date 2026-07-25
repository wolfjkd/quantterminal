import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

import sys
sys.path.append('C:\\Users\\wolfj\\Documents\\trae_projects')

from quantengine.core.backtest import BacktestEngine
from quantengine.core.strategy import StrategyLab
from quantengine.core.signal import SignalEngine
from quantengine.core.factor import FactorEngine
from quantengine.core.screener import Screener
from quantengine.data.loader import DataLoader
from quantengine.data.storage import DataStorage
from quantengine.data.sync import DataSync

app = FastAPI(title="QuantTerminal API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = DataStorage()
loader = DataLoader()
sync = DataSync(loader, storage)


class KlineRequest(BaseModel):
    stock_code: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class BacktestRequest(BaseModel):
    strategy: str
    stock_code: str
    params: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None


class StrategyRequest(BaseModel):
    strategy: str
    stock_code: str
    params: Optional[Dict[str, Any]] = None


class SignalRequest(BaseModel):
    stock_code: str
    filters: Optional[Dict[str, Any]] = None


class FactorRequest(BaseModel):
    factor_weights: Optional[Dict[str, float]] = None
    filters: Optional[Dict[str, Any]] = None


class ScreenerRequest(BaseModel):
    conditions: Dict[str, Dict[str, Any]]
    filters: Optional[Dict[str, Any]] = None


class SyncRequest(BaseModel):
    stock_code: Optional[str] = None
    mode: str = 'incremental'


@app.get("/")
def root():
    return {"message": "QuantTerminal API", "version": "0.1.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/stocks")
def get_stocks(market: Optional[str] = None):
    try:
        stocks = storage.get_stock_list(market)
        return {"data": stocks, "count": len(stocks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/kline/{stock_code}")
def get_kline(stock_code: str, start_date: Optional[str] = None, end_date: Optional[str] = None):
    try:
        klines = storage.load_kline(stock_code, start_date, end_date)
        return {"data": klines, "count": len(klines)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/backtest")
def run_backtest(request: BacktestRequest):
    try:
        klines = storage.load_kline(request.stock_code)
        if not klines:
            raise HTTPException(status_code=404, detail=f"No kline data found for {request.stock_code}")

        engine = BacktestEngine(settings=request.settings)
        result = engine.run(request.strategy, klines, request.params)

        return {
            "strategy": request.strategy,
            "stock_code": request.stock_code,
            "metrics": result.metrics,
            "summary": result.summary(),
            "trades": result.trades,
            "equity_curve": result.equity_curve
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/strategies")
def get_strategies():
    return {"data": StrategyLab.catalog()}


@app.post("/strategy/signals")
def get_strategy_signals(request: StrategyRequest):
    try:
        klines = storage.load_kline(request.stock_code)
        if not klines:
            raise HTTPException(status_code=404, detail=f"No kline data found for {request.stock_code}")

        signals = StrategyLab.run(request.strategy, klines, request.params)
        return {"data": signals, "count": len(signals)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signal/analyze")
def analyze_signal(request: SignalRequest):
    try:
        klines = storage.load_kline(request.stock_code)
        if not klines:
            raise HTTPException(status_code=404, detail=f"No kline data found for {request.stock_code}")

        signal = SignalEngine.analyze(request.stock_code, klines)
        return signal.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/signal/scan")
def scan_signals(request: SignalRequest):
    try:
        stocks = storage.get_stock_list()[:50]
        stocks_data = {}
        for stock in stocks:
            klines = storage.load_kline(stock['code'])
            if klines:
                stocks_data[stock['code']] = klines

        results = SignalEngine.scan(stocks_data, filters=request.filters)
        return {"data": [r.to_dict() for r in results], "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/factors")
def get_factors():
    return {"data": FactorEngine.catalog()}


@app.post("/factors/score")
def score_factors(request: FactorRequest):
    try:
        stocks = storage.get_stock_list()[:50]
        stocks_data = {}
        for stock in stocks:
            klines = storage.load_kline(stock['code'])
            if klines:
                stocks_data[stock['code']] = klines

        results = FactorEngine.score(stocks_data, request.factor_weights, request.filters)
        return {"data": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/factors/ic/{factor_code}")
def analyze_ic(factor_code: str):
    try:
        stocks = storage.get_stock_list()[:20]
        stocks_data = {}
        for stock in stocks:
            klines = storage.load_kline(stock['code'])
            if len(klines) >= 80:
                stocks_data[stock['code']] = klines

        result = FactorEngine.ic_analysis(factor_code, stocks_data)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/screener/conditions")
def get_screener_conditions():
    return {"data": Screener.get_conditions()}


@app.post("/screener/screen")
def run_screener(request: ScreenerRequest):
    try:
        stocks = storage.get_stock_list()[:100]
        stocks_data = {}
        for stock in stocks:
            klines = storage.load_kline(stock['code'])
            if klines:
                stocks_data[stock['code']] = klines

        results = Screener.screen(stocks_data, request.conditions, request.filters)
        return {"data": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sync")
def sync_data(request: SyncRequest):
    try:
        if request.stock_code:
            result = sync.sync_kline(request.stock_code, request.mode)
            return {"stock_code": request.stock_code, **result}
        else:
            result = sync.sync_stock_list()
            return {"type": "stock_list", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/storage/health")
def storage_health():
    return storage.health_check()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)