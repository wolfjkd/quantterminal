"""双核对比 router

  GET  /compare                双核心全屏对比数据
  GET  /compare/stocks/{code}  单股详细分析
  PUT  /compare/focus          更新双核心配置（仅 admin）
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from backend.models import User
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user, require_role
from backend.services import compare_service

router = APIRouter(prefix="/compare", tags=["compare"])


class FocusStockItem(BaseModel):
    code: str
    name: str = ""
    note: str = ""
    color: str = "#22d3ee"


class FocusUpdateRequest(BaseModel):
    stocks: List[FocusStockItem]


@router.get("")
def compare_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """双核心全屏对比：返回两只股票的 SignalEngine 分析 + 雷达图 + 对比结论"""
    return compare_service.get_compare_overview(db)


@router.get("/stocks/{code}")
def compare_stock_detail(
    code: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """单股详细分析"""
    return compare_service.get_stock_detail(db, code)


@router.put("/focus")
def update_focus(
    req: FocusUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """更新双核心配置"""
    if len(req.stocks) < 2:
        raise HTTPException(status_code=400, detail="双核心至少需要 2 只股票")
    compare_service.set_focus_stocks(
        db, [s.model_dump() for s in req.stocks]
    )
    return {"message": "双核心配置已更新", "count": len(req.stocks)}
