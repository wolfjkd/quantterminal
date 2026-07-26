"""交易笔记 router"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from backend.models import User, TradeNote
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user

router = APIRouter(prefix="/trade-notes", tags=["trade_note"])


class NoteCreate(BaseModel):
    code: str = ""
    content: str


@router.get("")
def note_list(
    code: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(TradeNote)
    if code:
        q = q.filter(TradeNote.code == code)
    total = q.count()
    rows = q.order_by(TradeNote.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "data": [
            {
                "id": r.id, "user_id": r.user_id, "code": r.code,
                "content": r.content,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
        "total": total, "page": page, "page_size": page_size,
    }


@router.post("")
def note_create(req: NoteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = TradeNote(user_id=user.id, code=req.code, content=req.content)
    db.add(n)
    db.commit()
    db.refresh(n)
    return {"id": n.id, "message": "笔记已保存"}


@router.delete("/{note_id}")
def note_delete(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.query(TradeNote).filter_by(id=note_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="笔记不存在")
    db.delete(n)
    db.commit()
    return {"message": "已删除"}
