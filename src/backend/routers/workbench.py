"""量化工作台 router

  GET  /workbench                 工作台首页（数据健康度 + 策略目录 + 最近扫描）
  POST /workbench/run             运行策略选股
  POST /workbench/prepare         一键准备行情（接入东方财富同步）
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional

from backend.models import User, Stock, DailyBar
from backend.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.services.auth_service import get_current_user
from backend.services import workbench_service, sync_service

router = APIRouter(prefix="/workbench", tags=["workbench"])


class RunRequest(BaseModel):
    strategy: str = "composite"
    top_n: int = 15
    min_score: float = 55
    min_amount: float = 20_000_000
    only_buy: bool = True
    fresh_days: int = 7
    scan_all_limit: int = 800


class PrepareRequest(BaseModel):
    mode: str = "smart"  # smart=同步最旧数据 / full=扩容股票池后同步前N只
    limit: int = 30


@router.get("")
def workbench_index(
    strategy: str = Query("composite"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """工作台首页：数据健康度 + 策略目录 + 最近扫描结果"""
    return workbench_service.get_workbench_overview(db, strategy)


@router.post("/run")
def workbench_run(
    req: RunRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """运行策略选股（桥接 quantengine SignalEngine）"""
    if not workbench_service.signal_service.is_quantengine_available():
        return {"error": "quantengine 不可用"}

    return workbench_service.run_strategy(
        db,
        user_id=user.id,
        strategy=req.strategy,
        top_n=req.top_n,
        min_score=req.min_score,
        min_amount=req.min_amount,
        only_buy=req.only_buy,
        fresh_days=req.fresh_days,
        scan_all_limit=req.scan_all_limit,
    )


@router.post("/prepare")
def workbench_prepare(
    req: PrepareRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """一键准备行情：批量同步最旧数据的股票 K 线

    - smart：取最近 K 线最旧的 `limit` 只股票，逐个同步
    - full：先调用 sync_stock_list 扩容，再取前 `limit` 只同步
    """
    limit = max(1, min(req.limit, 100))
    summary = {
        "mode": req.mode,
        "limit": limit,
        "success": 0,
        "failed": 0,
        "imported_bars": 0,
        "details": [],
    }

    if req.mode == "full":
        # 扩容股票池
        list_res = sync_service.sync_stock_list(db, user_id=user.id)
        summary["stock_list_updated"] = list_res.get("new_count", 0) + list_res.get("updated_count", 0)

    # 找出 K 线最旧的 limit 只股票（按最新 trade_date 升序）
    rows = (
        db.query(Stock.id, Stock.code, func.max(DailyBar.trade_date).label("latest"))
        .outerjoin(DailyBar, DailyBar.stock_id == Stock.id)
        .filter(Stock.status == 1, Stock.is_st == 0)
        .group_by(Stock.id, Stock.code)
        .order_by(func.max(DailyBar.trade_date).asc())
        .limit(limit)
        .all()
    )

    for stock_id, code, _latest in rows:
        res = sync_service.sync_stock_bars(db, code, user_id=user.id)
        if res.get("success"):
            summary["success"] += 1
            summary["imported_bars"] += res.get("imported", 0)
            summary["details"].append({"code": code, "ok": True, "imported": res.get("imported", 0)})
        else:
            summary["failed"] += 1
            summary["details"].append({"code": code, "ok": False, "error": res.get("message", "")})

    summary["message"] = (
        f"批量同步完成：成功 {summary['success']} / 失败 {summary['failed']} "
        f"/ 共导入 {summary['imported_bars']} 条 K 线"
    )
    return summary
