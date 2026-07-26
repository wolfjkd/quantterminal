"""自选股 router"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.models import User, Watchlist, WatchlistItem, Stock
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user
from backend.services.audit_service import log_from_request

router = APIRouter(prefix="/watchlists", tags=["watchlist"])


class WatchlistCreate(BaseModel):
    name: str
    remark: str = ""


class WatchlistItemAdd(BaseModel):
    stock_id: int
    note: str = ""


@router.get("")
def watchlist_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """自选池列表（双核心 watchlists）"""
    rows = db.query(Watchlist).order_by(Watchlist.id).all()
    return {
        "data": [
            {
                "id": r.id, "name": r.name, "user_id": r.user_id,
                "remark": r.remark, "items_count": len(r.items),
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.post("")
def watchlist_create(
    payload: WatchlistCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = Watchlist(name=payload.name, user_id=user.id, remark=payload.remark)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    log_from_request(db, user.id, "watchlist_create", f"创建自选池 {wl.name}", None)
    db.commit()
    return {"id": wl.id, "name": wl.name}


@router.get("/{wl_id}")
def watchlist_detail(wl_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """自选池成分"""
    wl = db.query(Watchlist).filter_by(id=wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="自选池不存在")
    return {
        "id": wl.id, "name": wl.name, "remark": wl.remark,
        "items": [
            {
                "id": it.id, "stock_id": it.stock_id, "code": it.code,
                "note": it.note, "created_at": str(it.created_at) if it.created_at else None,
            }
            for it in wl.items
        ],
    }


@router.post("/{wl_id}/items")
def watchlist_add_item(
    wl_id: int,
    payload: WatchlistItemAdd,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wl = db.query(Watchlist).filter_by(id=wl_id).first()
    if not wl:
        raise HTTPException(status_code=404, detail="自选池不存在")
    stock = db.query(Stock).filter_by(id=payload.stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="股票不存在")
    item = WatchlistItem(
        watchlist_id=wl_id, stock_id=stock.id, code=stock.code, note=payload.note,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "stock_id": stock.id, "code": stock.code}


@router.delete("/{wl_id}/items/{item_id}")
def watchlist_remove_item(
    wl_id: int,
    item_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(WatchlistItem).filter_by(id=item_id, watchlist_id=wl_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="条目不存在")
    db.delete(item)
    db.commit()
    return {"message": "已删除"}
