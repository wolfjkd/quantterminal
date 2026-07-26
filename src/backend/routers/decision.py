"""操盘台 router

接口：
  GET  /decision                今日决策（buy/sell/top 三组）
  GET  /decision/history        历史扫描记录
  GET  /decision/run/{run_id}   单次扫描结果详情
  GET  /decision/stock/{code}   个股历史信号
  POST /decision/run            一键扫描（桥接 quantengine SignalEngine）
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import signal_service
from sqlalchemy.orm import Session

router = APIRouter(prefix="/decision", tags=["decision"])


class DecisionRunRequest(BaseModel):
    scope: str = "all"  # all / watchlist / main
    top_n: int = 20
    min_score: float = 55.0
    min_amount: float = 20_000_000.0
    only_buy: bool = True
    watchlist_id: Optional[int] = None
    fresh_days: int = 7
    atr_stop_k: float = 2.0
    rr_ratio: float = 2.0
    kline_days: int = 90
    scan_all_limit: int = 800


@router.get("")
def decision_index(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """今日决策：买/卖/Top 列表 + 上次扫描结果"""
    return signal_service.get_today_decision(db)


@router.get("/history")
def decision_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """历史信号扫描列表"""
    return signal_service.get_history_runs(db, page, page_size)


@router.get("/run/{run_id}")
def decision_run_detail(
    run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """单次扫描结果详情"""
    return signal_service.get_run_detail(db, run_id)


@router.get("/stock/{code}")
def decision_stock_history(
    code: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """个股历史信号"""
    return signal_service.get_stock_history(db, code)


@router.post("/run")
def decision_run(
    req: DecisionRunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """一键选股扫描（桥接 quantengine SignalEngine）

    流程：
      1. 取股票池（全市场/自选股/主板）
      2. 拉取每只股票最近 K 线
      3. 调用 SignalEngine.scan 批量分析
      4. 持久化到 signal_runs + signal_results
      5. 返回 Top N 结果
    """
    if not signal_service.is_quantengine_available():
        return {
            "error": "quantengine 不可用",
            "detail": "请确认 quantengine 项目路径配置正确",
        }

    return signal_service.run_signal_scan(
        db,
        user_id=user.id,
        scope=req.scope,
        watchlist_id=req.watchlist_id,
        top_n=req.top_n,
        min_score=req.min_score,
        min_amount=req.min_amount,
        only_buy=req.only_buy,
        fresh_days=req.fresh_days,
        atr_stop_k=req.atr_stop_k,
        rr_ratio=req.rr_ratio,
        kline_days=req.kline_days,
        scan_all_limit=req.scan_all_limit,
    )
