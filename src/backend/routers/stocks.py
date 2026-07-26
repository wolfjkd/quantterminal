"""股票池 router"""
from fastapi import APIRouter, Depends, Query
from typing import Optional

from backend.models import User, Stock
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user
from fastapi import HTTPException

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("")
def stocks_list(
    market: Optional[str] = None,
    board: Optional[str] = None,
    is_st: Optional[int] = None,
    keyword: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """股票池列表：支持市场/板块/ST/关键字过滤"""
    q = db.query(Stock)
    if market:
        q = q.filter(Stock.market == market)
    if board:
        q = q.filter(Stock.board == board)
    if is_st is not None:
        q = q.filter(Stock.is_st == is_st)
    if keyword:
        like = f"%{keyword}%"
        q = q.filter((Stock.code.like(like)) | (Stock.name.like(like)))

    total = q.count()
    rows = q.order_by(Stock.id).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "data": [
            {
                "id": r.id, "code": r.code, "name": r.name,
                "market": r.market, "board": r.board,
                "industry": r.industry, "is_st": r.is_st,
                "status": r.status, "list_date": str(r.list_date) if r.list_date else None,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{code}")
def stock_detail(code: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """个股详情"""
    s = db.query(Stock).filter_by(code=code).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"股票不存在：{code}")
    return {
        "id": s.id, "code": s.code, "name": s.name,
        "market": s.market, "board": s.board,
        "industry": s.industry, "is_st": s.is_st,
        "status": s.status, "list_date": str(s.list_date) if s.list_date else None,
        "remark": s.remark,
    }
