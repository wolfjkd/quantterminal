"""策略管理 router

  - 内置策略目录（8种，桥接 quantengine.BacktestEngine.STRATEGY_CATALOG）
  - 自定义策略 CRUD
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, Strategy
from backend.services.auth_service import get_current_user
from backend.services.backtest_service import STRATEGY_CATALOG

router = APIRouter(prefix="/strategies", tags=["strategy"])


# ============ 请求模型 ============

class StrategyCreateRequest(BaseModel):
    name: str
    strategy_type: str = "custom"
    params_json: str = "{}"
    status: int = 1
    remark: str = ""


class StrategyUpdateRequest(BaseModel):
    name: str | None = None
    strategy_type: str | None = None
    params_json: str | None = None
    status: int | None = None
    remark: str | None = None


# ============ 内置策略目录 ============

@router.get("/catalog")
def strategy_catalog(user: User = Depends(get_current_user)):
    """quantengine.BacktestEngine 支持的 8 种内置策略目录"""
    return {
        "data": STRATEGY_CATALOG,
        "count": len(STRATEGY_CATALOG),
    }


# ============ 自定义策略 CRUD ============

@router.get("")
def strategy_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Strategy).order_by(Strategy.id).all()
    return {
        "data": [
            {
                "id": r.id, "name": r.name, "strategy_type": r.strategy_type,
                "params_json": r.params_json, "status": r.status,
                "remark": r.remark,
                "created_at": str(r.created_at) if r.created_at else None,
                "updated_at": str(r.updated_at) if r.updated_at else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.get("/{sid}")
def strategy_detail(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Strategy).filter_by(id=sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="策略不存在")
    return {
        "id": s.id, "name": s.name, "strategy_type": s.strategy_type,
        "params_json": s.params_json, "remark": s.remark, "status": s.status,
        "created_at": str(s.created_at) if s.created_at else None,
        "updated_at": str(s.updated_at) if s.updated_at else None,
    }


@router.post("")
def strategy_create(req: StrategyCreateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = Strategy(
        name=req.name, strategy_type=req.strategy_type,
        params_json=req.params_json, status=req.status, remark=req.remark,
        created_by=user.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "strategy_type": s.strategy_type}


@router.put("/{sid}")
def strategy_update(sid: int, req: StrategyUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Strategy).filter_by(id=sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="策略不存在")
    data = req.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    db.commit()
    return {"id": s.id, "updated": list(data.keys())}


@router.delete("/{sid}")
def strategy_delete(sid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Strategy).filter_by(id=sid).first()
    if not s:
        raise HTTPException(status_code=404, detail="策略不存在")
    db.delete(s)
    db.commit()
    return {"id": sid, "deleted": True}
