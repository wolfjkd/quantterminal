"""投资组合 router

  GET    /portfolios                列表（含 market_value/equity/盈亏）
  POST   /portfolios                创建组合
  GET    /portfolios/{pf_id}        详情（持仓/委托/成交/权益）
  POST   /portfolios/{pf_id}/order  下单（buy/sell）
  POST   /portfolios/{pf_id}/settle 日终解冻（持仓全部可卖）
  GET    /portfolios/{pf_id}/equity 权益曲线
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from backend.models import User
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user
from backend.services import portfolio_service

router = APIRouter(prefix="/portfolios", tags=["portfolio"])


class PortfolioCreate(BaseModel):
    name: str
    initial_cash: Optional[float] = None


class OrderRequest(BaseModel):
    stock_id: int
    side: str  # buy / sell
    qty: int


@router.get("")
def portfolio_list(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """模拟组合列表"""
    return portfolio_service.list_portfolios(db)


@router.post("")
def portfolio_create(
    req: PortfolioCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建模拟组合"""
    return portfolio_service.create_portfolio(db, user.id, req.name, req.initial_cash)


@router.get("/{pf_id}")
def portfolio_detail(
    pf_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """组合详情：持仓 / 委托 / 成交 / 权益"""
    res = portfolio_service.get_portfolio_detail(db, pf_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.post("/{pf_id}/order")
def portfolio_order(
    pf_id: int,
    req: OrderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下单（buy/sell）：T+1 检查、涨跌停检查、费用计算"""
    res = portfolio_service.place_order(
        db, user.id, pf_id, req.stock_id, req.side, req.qty,
    )
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/{pf_id}/settle")
def portfolio_settle(
    pf_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """日终解冻：持仓全部变为可卖（模拟下一交易日开盘）"""
    res = portfolio_service.settle_t1(db, user.id, pf_id)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.get("/{pf_id}/equity")
def portfolio_equity(
    pf_id: int,
    days: int = Query(60, ge=10, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """权益曲线（最近 N 日）"""
    return portfolio_service.get_equity_curve(db, pf_id, days)
