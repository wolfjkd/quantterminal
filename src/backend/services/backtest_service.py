"""回测中心 service


支持 8 种策略：dual_ma / macd / kdj / boll / rsi / momentum / mean_reversion / composite
单股回测，完整持久化：
  - backtest_equity    净值曲线
  - backtest_trades    交易明细
  - backtest_positions 持仓快照
  - backtest_jobs.metrics_json  绩效指标
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from backend.config import QUANT_PROJECTS_ROOT
from backend.models import (
    Stock, DailyBar,
    BacktestJob, BacktestEquity, BacktestTrade, BacktestPosition,
)
from backend.services.audit_service import log_action


# ============ 动态导入 quantengine ============

def _ensure_quantengine_on_path() -> None:
    p = str(QUANT_PROJECTS_ROOT / "quantengine")
    if p not in sys.path:
        sys.path.insert(0, p)


_ensure_quantengine_on_path()

try:
    from quantengine.core.backtest import BacktestEngine  # type: ignore
    _QUANTENGINE_AVAILABLE = True
except Exception as e:
    BacktestEngine = None  # type: ignore
    _QUANTENGINE_AVAILABLE = False
    _IMPORT_ERROR = str(e)


# ============ 策略目录 ============

STRATEGY_CATALOG: List[Dict[str, Any]] = [
    {
        "key": "dual_ma",
        "name": "双均线金叉",
        "description": "快慢均线金叉买入、死叉卖出（经典策略）",
        "default_params": {"fast_period": 5, "slow_period": 20},
    },
    {
        "key": "macd",
        "name": "MACD 策略",
        "description": "DIF/DEA 金叉买入、死叉卖出",
        "default_params": {},
    },
    {
        "key": "kdj",
        "name": "KDJ 策略",
        "description": "K/D 金叉买入、死叉卖出",
        "default_params": {},
    },
    {
        "key": "boll",
        "name": "布林带策略",
        "description": "价格触下轨买入、触上轨卖出",
        "default_params": {},
    },
    {
        "key": "rsi",
        "name": "RSI 策略",
        "description": "RSI 超卖买入、超买卖出",
        "default_params": {"oversold": 30, "overbought": 70},
    },
    {
        "key": "momentum",
        "name": "动量策略",
        "description": "涨幅 >10% 买入，跌幅 >10% 卖出",
        "default_params": {"period": 20},
    },
    {
        "key": "mean_reversion",
        "name": "均值回归",
        "description": "偏离均线超过阈值反向操作",
        "default_params": {"period": 20, "threshold": 0.1},
    },
    {
        "key": "composite",
        "name": "综合策略",
        "description": "多维度综合评分（趋势+动量+量能+ATR）",
        "default_params": {},
    },
]

DEFAULT_SETTINGS = {
    "commission_rate": 0.0003,
    "min_commission": 5.0,
    "stamp_tax_rate": 0.0005,
    "slippage_bps": 10,
    "risk_free_rate": 0.02,
    "trading_days_year": 242,
    "max_weight": 0.2,
    "max_positions": 10,
    "stop_loss": 0.05,
    "take_profit": 0.10,
    "fill_mode": "close",
}


# ============ 列表 ============

def list_jobs(db: Session, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """任务列表"""
    q = db.query(BacktestJob).order_by(BacktestJob.id.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    data: List[Dict[str, Any]] = []
    for j in rows:
        metrics = json.loads(j.metrics_json) if j.metrics_json else {}
        data.append({
            "id": j.id,
            "name": j.name,
            "strategy_id": j.strategy_id,
            "strategy_type": j.strategy_type,
            "start_date": j.start_date.isoformat() if j.start_date else None,
            "end_date": j.end_date.isoformat() if j.end_date else None,
            "initial_cash": j.initial_cash,
            "status": j.status,
            "message": j.message,
            "total_return": metrics.get("total_return"),
            "max_drawdown": metrics.get("max_drawdown"),
            "sharpe_ratio": metrics.get("sharpe_ratio"),
            "num_trades": metrics.get("num_trades", 0),
            "final_equity": metrics.get("final_equity"),
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        })

    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ============ 详情 ============

def get_job_detail(db: Session, job_id: int) -> Dict[str, Any]:
    """回测详情：含 metrics / equity / trades / positions"""
    job = db.query(BacktestJob).filter_by(id=job_id).first()
    if not job:
        return {"error": "回测任务不存在"}

    metrics = json.loads(job.metrics_json) if job.metrics_json else {}
    params = json.loads(job.params_json) if job.params_json else {}

    equity_rows = (
        db.query(BacktestEquity)
        .filter(BacktestEquity.job_id == job_id)
        .order_by(BacktestEquity.trade_date.asc())
        .all()
    )
    trade_rows = (
        db.query(BacktestTrade)
        .filter(BacktestTrade.job_id == job_id)
        .order_by(BacktestTrade.trade_date.asc(), BacktestTrade.id.asc())
        .all()
    )
    position_rows = (
        db.query(BacktestPosition)
        .filter(BacktestPosition.job_id == job_id)
        .order_by(BacktestPosition.id.asc())
        .all()
    )

    return {
        "id": job.id,
        "name": job.name,
        "strategy_id": job.strategy_id,
        "strategy_type": job.strategy_type,
        "params": params,
        "start_date": job.start_date.isoformat() if job.start_date else None,
        "end_date": job.end_date.isoformat() if job.end_date else None,
        "initial_cash": job.initial_cash,
        "status": job.status,
        "message": job.message,
        "metrics": metrics,
        "equity": [
            {
                "trade_date": e.trade_date.isoformat() if e.trade_date else None,
                "equity": e.equity,
                "cash": e.cash,
                "market_value": e.market_value,
                "benchmark_equity": e.benchmark_equity,
            }
            for e in equity_rows
        ],
        "trades": [
            {
                "id": t.id,
                "trade_date": t.trade_date.isoformat() if t.trade_date else None,
                "code": t.code,
                "name": t.name,
                "side": t.side,
                "price": t.price,
                "qty": t.qty,
                "amount": t.amount,
                "commission": t.commission,
                "stamp_tax": t.stamp_tax,
                "fee": t.fee,
                "pnl": t.pnl,
                "reason": t.reason,
            }
            for t in trade_rows
        ],
        "positions": [
            {
                "id": p.id,
                "stock_id": p.stock_id,
                "code": p.code,
                "name": p.name,
                "qty": p.qty,
                "cost": p.cost,
                "close_price": p.close_price,
            }
            for p in position_rows
        ],
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


# ============ 运行回测 ============

def run_backtest(
    db: Session,
    user_id: int,
    name: str,
    strategy_type: str,
    stock_id: int,
    start_date: str,
    end_date: str,
    initial_cash: float = 1_000_000.0,
    params: Optional[Dict[str, Any]] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """运行回测

    流程：
      1. 校验股票/日期
      2. 拉 K 线
      3. 创建 BacktestJob（status=running）
      4. 调用 quantengine BacktestEngine.run
      5. 持久化 equity / trades / positions / metrics
      6. 更新 BacktestJob.status=done
    """
    if not _QUANTENGINE_AVAILABLE:
        return {"error": f"quantengine 不可用：{_IMPORT_ERROR}"}

    # 校验策略
    valid_strategies = {s["key"] for s in STRATEGY_CATALOG}
    if strategy_type not in valid_strategies:
        return {"error": f"未知策略：{strategy_type}"}

    # 校验股票
    stock = db.query(Stock).filter_by(id=stock_id).first()
    if not stock:
        return {"error": "股票不存在"}

    # 解析日期
    try:
        sd = datetime.strptime(start_date, "%Y-%m-%d").date()
        ed = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return {"error": "日期格式错误，需 YYYY-MM-DD"}

    if sd >= ed:
        return {"error": "开始日期必须早于结束日期"}

    # 拉 K 线
    bars = (
        db.query(DailyBar)
        .filter(
            DailyBar.stock_id == stock_id,
            DailyBar.trade_date >= sd,
            DailyBar.trade_date <= ed,
        )
        .order_by(DailyBar.trade_date.asc())
        .all()
    )
    if len(bars) < 30:
        return {"error": f"K 线数据不足（{len(bars)} 条），至少需要 30 条"}

    klines: List[Dict[str, Any]] = [
        {
            "date": b.trade_date.isoformat(),
            "open": float(b.open or 0),
            "high": float(b.high or 0),
            "low": float(b.low or 0),
            "close": float(b.close or 0),
            "volume": int(b.volume or 0),
            "amount": float(b.amount or 0),
            "code": stock.code,
            "name": stock.name,
            "is_st": bool(stock.is_st),
        }
        for b in bars
    ]

    # 合并参数：默认 + 用户传入
    catalog_entry = next((s for s in STRATEGY_CATALOG if s["key"] == strategy_type), None)
    final_params: Dict[str, Any] = {}
    if catalog_entry:
        final_params.update(catalog_entry["default_params"])
    if params:
        final_params.update(params)

    # 合并 settings
    final_settings = {**DEFAULT_SETTINGS, **(settings or {})}

    # 创建任务
    job = BacktestJob(
        name=name or f"{catalog_entry['name'] if catalog_entry else strategy_type} {stock.code}",
        strategy_type=strategy_type,
        params_json=json.dumps({**final_params, "stock_id": stock_id, "stock_code": stock.code}, ensure_ascii=False),
        start_date=sd,
        end_date=ed,
        initial_cash=initial_cash,
        status="running",
        created_by=user_id,
    )
    db.add(job)
    db.flush()  # 拿 job.id
    db.commit()

    # 运行回测（同步阻塞，单股 < 1s）
    try:
        engine = BacktestEngine(initial_cash=initial_cash, settings=final_settings)
        result = engine.run(strategy_type, klines, final_params)

        # 持久化 equity
        equity_curve = result.equity_curve
        trades = result.trades
        metrics = result.metrics

        # 构造每个交易日对应的 cash + market_value
        # quantengine 没有暴露每日 cash/market_value，这里用近似计算
        cash_curve = _compute_cash_curve(initial_cash, trades, equity_curve, klines)

        equity_to_save: List[BacktestEquity] = []
        for i, eq_value in enumerate(equity_curve):
            td = bars[i].trade_date if i < len(bars) else bars[-1].trade_date
            cash_val, mv_val = cash_curve[i]
            equity_to_save.append(BacktestEquity(
                job_id=job.id,
                trade_date=td,
                equity=float(eq_value),
                cash=cash_val,
                market_value=mv_val,
                benchmark_equity=None,  # 暂不接基准
            ))
        if equity_to_save:
            db.bulk_save_objects(equity_to_save)

        # 持久化 trades
        trades_to_save: List[BacktestTrade] = []
        for t in trades:
            td_str = t.get("date", "")
            try:
                td = datetime.strptime(td_str, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                td = bars[-1].trade_date
            side = t.get("type", "buy")
            qty = int(t.get("quantity", 0))
            price = float(t.get("price", 0))
            amount = round(price * qty, 2)
            commission = float(t.get("commission", 0))
            stamp_tax = float(t.get("stamp_tax", 0))
            fee = round(commission + stamp_tax, 4)
            pnl = float(t.get("profit", 0)) if side == "sell" else None
            reason = "止盈" if pnl and pnl > 0 else "止损" if pnl and pnl < 0 else ""
            trades_to_save.append(BacktestTrade(
                job_id=job.id,
                trade_date=td,
                stock_id=stock_id,
                code=stock.code,
                name=stock.name,
                side=side,
                price=price,
                qty=qty,
                amount=amount,
                commission=commission,
                stamp_tax=stamp_tax,
                fee=fee,
                pnl=pnl,
                reason=reason,
            ))
        if trades_to_save:
            db.bulk_save_objects(trades_to_save)

        # 持久化最终持仓
        final_positions = engine.positions
        last_close = float(bars[-1].close or 0)
        positions_to_save: List[BacktestPosition] = []
        for code, pos in final_positions.items():
            if pos.get("quantity", 0) <= 0:
                continue
            positions_to_save.append(BacktestPosition(
                job_id=job.id,
                stock_id=stock_id,
                code=code,
                name=stock.name,
                qty=int(pos["quantity"]),
                cost=float(pos.get("avg_cost", 0)),
                close_price=last_close,
            ))
        if positions_to_save:
            db.bulk_save_objects(positions_to_save)

        # 更新 metrics
        metrics_payload = {
            **metrics,
            "metrics_version": "1.0",
            "strategy_name": catalog_entry["name"] if catalog_entry else strategy_type,
            "stock_code": stock.code,
            "stock_name": stock.name,
            "klines_count": len(klines),
        }
        job.metrics_json = json.dumps(metrics_payload, ensure_ascii=False, default=float)
        job.status = "done"
        job.message = "ok"
        job.finished_at = datetime.now()
        db.commit()

        log_action(db, user_id, "backtest_run",
                   f"job={job.id} {strategy_type} {stock.code} ret={metrics.get('total_return', 0):.4f}")
        db.commit()

        return {
            "job_id": job.id,
            "status": "done",
            "message": "回测完成",
            "metrics": metrics_payload,
            "equity_count": len(equity_to_save),
            "trades_count": len(trades_to_save),
            "positions_count": len(positions_to_save),
        }

    except Exception as e:
        # 失败：更新任务状态
        job.status = "failed"
        job.message = f"回测失败：{e}"[:500]
        job.finished_at = datetime.now()
        db.commit()
        return {"error": f"回测失败：{e}", "job_id": job.id}


# ============ 工具函数 ============

def _compute_cash_curve(
    initial_cash: float,
    trades: List[Dict[str, Any]],
    equity_curve: List[float],
    klines: List[Dict[str, Any]],
) -> List[tuple]:
    """根据 trades 推算每个交易日的 (cash, market_value)

    简化：从 initial_cash 开始，遇到 buy 扣 total_cost，遇到 sell 加 total_revenue
    market_value = equity - cash
    """
    cash = float(initial_cash)
    result: List[tuple] = []
    trade_idx = 0
    trade_by_date: Dict[str, List[Dict[str, Any]]] = {}
    for t in trades:
        d = t.get("date", "")
        trade_by_date.setdefault(d, []).append(t)

    for i, eq in enumerate(equity_curve):
        d = klines[i].get("date", "") if i < len(klines) else ""
        for t in trade_by_date.get(d, []):
            side = t.get("type")
            qty = int(t.get("quantity", 0))
            price = float(t.get("price", 0))
            commission = float(t.get("commission", 0))
            stamp_tax = float(t.get("stamp_tax", 0))
            if side == "buy":
                cash -= qty * price + commission
            else:
                cash += qty * price - commission - stamp_tax
        mv = float(eq) - cash
        result.append((round(cash, 2), round(mv, 2)))
    return result


def is_quantengine_available() -> bool:
    return _QUANTENGINE_AVAILABLE


def get_strategy_catalog() -> List[Dict[str, Any]]:
    """策略目录（给前端表单用）"""
    return STRATEGY_CATALOG
