"""条件选股 router

桥接 quantengine.Screener（5类30+条件）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import screener_service

router = APIRouter(prefix="/screener", tags=["screener"])


# ============ 请求模型 ============

class ScreenRequest(BaseModel):
    conditions: dict  # {condition_code: {param: value, ...}}
    filters: dict = {}
    limit: int = 1000
    board: str | None = None
    industry: str | None = None
    top_n: int = 100


# ============ 条件目录 ============

@router.get("/conditions")
def screener_conditions(user: User = Depends(get_current_user)):
    """quantengine.Screener 内置 5 类 30+ 条件清单"""
    return screener_service.conditions()


@router.get("/available")
def screener_available(user: User = Depends(get_current_user)):
    """引擎可用性"""
    return {"available": screener_service.is_available()}


# ============ 执行筛选 ============

@router.post("/screen")
def screener_run(req: ScreenRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """多条件组合筛选 - 桥接 quantengine.Screener.screen"""
    return screener_service.screen(
        db,
        conditions=req.conditions,
        filters=req.filters,
        limit=req.limit,
        board=req.board,
        industry=req.industry,
        top_n=req.top_n,
    )
