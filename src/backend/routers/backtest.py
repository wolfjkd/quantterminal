"""回测中心 router

  - GET  /backtest           任务列表（含概要 metrics）
  - GET  /backtest/catalog   策略目录（8 种策略）
  - GET  /backtest/{job_id}  详情（equity/trades/positions/metrics）
  - POST /backtest/run       运行回测（单股，同步阻塞）
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, Stock
from backend.services.auth_service import get_current_user
from backend.services import backtest_service

router = APIRouter(prefix="/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    """运行回测请求

    前端传 stock_code（用户友好），router 内部解析为 stock_id
    """
    strategy_type: str
    stock_code: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    initial_cash: float = 1_000_000.0
    name: str | None = None
    params: dict = {}


@router.get("")
def backtest_jobs(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """任务列表"""
    return backtest_service.list_jobs(db, page=page, page_size=page_size)


@router.get("/catalog")
def backtest_catalog(user: User = Depends(get_current_user)):
    """策略目录"""
    return {
        "data": backtest_service.get_strategy_catalog(),
        "quantengine_available": backtest_service.is_quantengine_available(),
    }


@router.get("/{job_id}")
def backtest_detail(
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """回测详情"""
    res = backtest_service.get_job_detail(db, job_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.post("/run")
def backtest_run(
    req: BacktestRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """运行回测

    流程：
      1. stock_code → stock_id
      2. 调 service.run_backtest（桥接 quantengine）
      3. 返回 job_id + metrics 摘要
    """
    # 解析股票
    stock = db.query(Stock).filter_by(code=req.stock_code.upper()).first()
    if not stock:
        raise HTTPException(status_code=400, detail=f"股票不存在：{req.stock_code}")

    res = backtest_service.run_backtest(
        db=db,
        user_id=user.id,
        name=req.name or f"{req.strategy_type} {stock.code}",
        strategy_type=req.strategy_type,
        stock_id=stock.id,
        start_date=req.start_date,
        end_date=req.end_date,
        initial_cash=req.initial_cash,
        params=req.params,
    )

    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res
