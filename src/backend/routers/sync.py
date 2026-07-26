"""行情同步 router

  - GET  /sync/logs              同步日志列表（含过滤）
  - GET  /sync/health            数据健康度
  - POST /sync                   触发同步检查（向后兼容：仅记录日志）
  - POST /sync/bars              拉取单股日K线（东方财富 push2his）
  - POST /sync/stocks            全市场股票列表扩容（东方财富 push2 clist）
  - GET  /sync/realtime/{code}   实时报价快照（东方财富 push2 qt stock get）
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncRequest(BaseModel):
    stock_code: str = ""
    mode: str = "incremental"


class SyncBarsRequest(BaseModel):
    stock_code: str
    beg_date: str = ""  # YYYYMMDD，默认 1 年前
    end_date: str = ""  # YYYYMMDD，默认今天
    fqt: int = 1  # 0=不复权 1=前复权 2=后复权


@router.get("/logs")
def sync_logs(
    page: int = 1,
    page_size: int = 50,
    status: str | None = None,
    source: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """同步日志列表"""
    return sync_service.list_logs(db, page=page, page_size=page_size, status=status, source=source)


@router.get("/health")
def sync_health(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """数据健康度"""
    return sync_service.health(db)


@router.post("")
def sync_run(
    req: SyncRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """触发同步（嵌入式终端：记录尝试 + 数据完整性检查，向后兼容）"""
    res = sync_service.run(db, user_id=user.id, stock_code=req.stock_code, mode=req.mode)
    if "error" in res:
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@router.post("/bars")
def sync_bars(
    req: SyncBarsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """拉取单股日K线并写入 SQLite（东方财富 push2his）"""
    res = sync_service.sync_stock_bars(
        db,
        stock_code=req.stock_code,
        beg_date=req.beg_date,
        end_date=req.end_date,
        fqt=req.fqt,
        user_id=user.id,
    )
    if not res.get("success", False):
        raise HTTPException(status_code=400, detail=res.get("message", "同步失败"))
    return res


@router.post("/stocks")
def sync_stocks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """全市场股票列表扩容（东方财富 push2 clist）"""
    res = sync_service.sync_stock_list(db, user_id=user.id)
    if not res.get("success", False):
        raise HTTPException(status_code=400, detail=res.get("message", "扩容失败"))
    return res


@router.get("/realtime/{code}")
def sync_realtime(
    code: str,
    user: User = Depends(get_current_user),
):
    """实时报价快照（东方财富 push2 qt stock get，不写库）"""
    res = sync_service.sync_realtime(code)
    if not res.get("success", False):
        raise HTTPException(status_code=400, detail=res.get("message", "实时行情暂不可用"))
    return res
