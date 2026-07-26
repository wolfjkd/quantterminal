"""交易计划 router"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.models import User, TradePlan
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/trade-plans", tags=["trade_plan"])


class PlanCreate(BaseModel):
    portfolio_id: int
    stock_id: int
    code: str
    name: str = ""
    entry_price: float
    stop_loss: float
    take_profit: float
    qty: int = 0
    position_pct: float = 0
    source: str = "desk"


@router.get("")
def plan_list(
    portfolio_id: Optional[int] = None,
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TradePlan)
    if portfolio_id:
        q = q.filter(TradePlan.portfolio_id == portfolio_id)
    if status:
        q = q.filter(TradePlan.status == status)
    rows = q.order_by(TradePlan.id.desc()).limit(100).all()
    return {
        "data": [
            {
                "id": r.id, "portfolio_id": r.portfolio_id,
                "stock_id": r.stock_id, "code": r.code, "name": r.name,
                "entry_price": r.entry_price, "stop_loss": r.stop_loss,
                "take_profit": r.take_profit, "qty": r.qty,
                "position_pct": r.position_pct, "status": r.status,
                "source": r.source, "close_reason": r.close_reason,
                "created_at": str(r.created_at) if r.created_at else None,
                "closed_at": str(r.closed_at) if r.closed_at else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.post("")
def plan_create(req: PlanCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = TradePlan(
        portfolio_id=req.portfolio_id, stock_id=req.stock_id,
        code=req.code, name=req.name,
        entry_price=req.entry_price, stop_loss=req.stop_loss,
        take_profit=req.take_profit, qty=req.qty,
        position_pct=req.position_pct, source=req.source,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "message": "交易计划已创建"}


@router.post("/{plan_id}/close")
def plan_close(
    plan_id: int,
    reason: str = "manual",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(TradePlan).filter_by(id=plan_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="交易计划不存在")
    p.status = "closed"
    p.close_reason = reason
    db.commit()
    return {"message": "已关闭", "id": plan_id}
