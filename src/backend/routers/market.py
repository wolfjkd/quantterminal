"""全A动向 router

  - GET /market          全A涨跌分布 + 指数 + 板块统计 + 近 N 日趋势
  - GET /market/sectors  板块行情明细
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import market_service

router = APIRouter(prefix="/market", tags=["market"])


@router.get("")
def market_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """全A动向总览"""
    return market_service.overview(db)


@router.get("/sectors")
def market_sectors(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """板块行情"""
    return market_service.sectors(db)
