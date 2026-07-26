"""实时分析 router - 单股深度分析

基于 daily_bars 最新数据：
  - GET /realtime/{code}  最新行情 + 涨跌 + 均线 + 年内高低 + 近 60 日 K 线
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import realtime_service

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.get("/{code}")
def realtime_stock(
    code: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """单股深度分析"""
    res = realtime_service.stock_detail(db, code)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res
