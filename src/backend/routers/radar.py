"""市场雷达 router

  GET  /radar             全市场雷达（涨跌/成交额/换手榜单）
  GET  /radar/compare     策略对比
  GET  /radar/validate    信号验证
  POST /radar/ingest      热股入库
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.models import User
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user
from backend.services import radar_service

router = APIRouter(prefix="/radar", tags=["radar"])


class RadarIngestRequest(BaseModel):
    source: str = "gainers"  # gainers/amount/turnover/main/mix
    limit: int = 25


@router.get("")
def radar_overview(
    live: bool = Query(False, description="是否联网拉取实时数据（暂未启用）"),
    top_n: int = Query(20, ge=5, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """全市场雷达：涨跌幅/成交额/换手榜单"""
    if live:
        return {
            "message": "实时联网雷达暂未启用，可后续接入 tradex-hub",
            "live": True,
            "fallback": radar_service.get_radar_overview(db, top_n),
        }
    return radar_service.get_radar_overview(db, top_n)


@router.get("/compare")
def radar_compare(
    min_amount: float = Query(20_000_000, ge=0),
    top_n: int = Query(12, ge=5, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """策略对比：多个策略在同一批股票上的命中率对比"""
    return radar_service.compare_strategies(db, min_amount, top_n)


@router.get("/validate")
def radar_validate(
    strategy: str = Query("composite"),
    days: int = Query(120, ge=60, le=360),
    step: int = Query(5, ge=3, le=15),
    max_signals: int = Query(120, ge=50, le=300),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """信号验证：从历史 K 线抽样信号，计算前向 N 日收益率分布"""
    return radar_service.validate_signals(db, strategy, days, step, max_signals)


@router.post("/ingest")
def radar_ingest(
    req: RadarIngestRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """热股一键入库"""
    return radar_service.ingest_hot_stocks(db, req.source, req.limit)
