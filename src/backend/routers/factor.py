"""因子中心 router

桥接 quantengine.FactorEngine（5类22因子）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, Factor
from backend.services.auth_service import get_current_user
from backend.services import factor_service

router = APIRouter(prefix="/factors", tags=["factor"])


# ============ 请求模型 ============

class FactorScoreRequest(BaseModel):
    factor_weights: dict = {}
    top_n: int = 20
    filters: dict = {}
    limit: int = 1000
    board: str | None = None
    industry: str | None = None


class ICAnalysisRequest(BaseModel):
    factor_code: str
    limit: int = 500
    period: int = 60


# ============ 内置因子目录（quantengine） ============

@router.get("/catalog")
def factor_catalog(user: User = Depends(get_current_user)):
    """quantengine FactorEngine 内置因子目录 + 分类"""
    return factor_service.catalog()


@router.get("/available")
def factor_available(user: User = Depends(get_current_user)):
    """引擎可用性"""
    return {"available": factor_service.is_available()}


# ============ 自定义因子 CRUD ============

@router.get("")
def factor_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Factor).order_by(Factor.id).all()
    return {
        "data": [
            {
                "id": r.id, "code": r.code, "name": r.name,
                "formula_type": r.formula_type, "params_json": r.params_json,
                "default_weight": r.default_weight, "is_reverse": r.is_reverse,
                "status": r.status, "remark": r.remark,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.get("/{factor_id}")
def factor_detail(factor_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(Factor).filter_by(id=factor_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="因子不存在")
    return {
        "id": f.id, "code": f.code, "name": f.name,
        "formula_type": f.formula_type, "params_json": f.params_json,
        "default_weight": f.default_weight, "is_reverse": f.is_reverse,
        "status": f.status, "remark": f.remark,
    }


class FactorCreateRequest(BaseModel):
    code: str
    name: str
    formula_type: str = "custom"
    params_json: str = "{}"
    default_weight: float = 1.0
    is_reverse: int = 0
    status: int = 1
    remark: str = ""


class FactorUpdateRequest(BaseModel):
    name: str | None = None
    formula_type: str | None = None
    params_json: str | None = None
    default_weight: float | None = None
    is_reverse: int | None = None
    status: int | None = None
    remark: str | None = None


@router.post("")
def factor_create(req: FactorCreateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(Factor).filter_by(code=req.code).first():
        raise HTTPException(status_code=400, detail="因子代码已存在")
    f = Factor(
        code=req.code, name=req.name, formula_type=req.formula_type,
        params_json=req.params_json, default_weight=req.default_weight,
        is_reverse=req.is_reverse, status=req.status, remark=req.remark,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return {"id": f.id, "code": f.code, "name": f.name}


@router.put("/{factor_id}")
def factor_update(factor_id: int, req: FactorUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(Factor).filter_by(id=factor_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="因子不存在")
    data = req.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(f, k, v)
    db.commit()
    return {"id": f.id, "updated": list(data.keys())}


@router.delete("/{factor_id}")
def factor_delete(factor_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(Factor).filter_by(id=factor_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="因子不存在")
    db.delete(f)
    db.commit()
    return {"id": factor_id, "deleted": True}


# ============ 因子打分选股 ============

@router.post("/score")
def factor_score(req: FactorScoreRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """多因子加权打分选股 - 桥接 quantengine.FactorEngine.score"""
    return factor_service.score(
        db,
        factor_weights=req.factor_weights,
        top_n=req.top_n,
        filters=req.filters,
        limit=req.limit,
        board=req.board,
        industry=req.industry,
    )


# ============ IC 分析 ============

@router.post("/ic")
def factor_ic(req: ICAnalysisRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """单因子 IC 分析 - 桥接 quantengine.FactorEngine.ic_analysis"""
    return factor_service.ic_analysis(
        db,
        factor_code=req.factor_code,
        limit=req.limit,
        period=req.period,
    )
