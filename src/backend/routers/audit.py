"""审计日志 router

  - 操作日志查询（按 action/user_id/关键词/时间范围筛选）
  - 按 action 分组统计
  - 导出 CSV
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta

from backend.models import User, AuditLog
from backend.database import get_db
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from backend.services.auth_service import get_current_user, require_role

router = APIRouter(prefix="/audit", tags=["audit"])


# ============ 查询参数 ============

class AuditQuery(BaseModel):
    action: Optional[str] = None
    user_id: Optional[int] = None
    keyword: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


# ============ 列表查询 ============

@router.get("")
def audit_list(
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    keyword: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if keyword:
        q = q.filter(AuditLog.detail.like(f"%{keyword}%"))
    if start_date:
        try:
            sd = datetime.fromisoformat(start_date)
            q = q.filter(AuditLog.created_at >= sd)
        except ValueError:
            pass
    if end_date:
        try:
            ed = datetime.fromisoformat(end_date) + timedelta(days=1)
            q = q.filter(AuditLog.created_at < ed)
        except ValueError:
            pass

    total = q.count()
    rows = q.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "data": [
            {
                "id": r.id, "user_id": r.user_id, "action": r.action,
                "detail": r.detail, "ip": r.ip,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
        "total": total, "page": page, "page_size": page_size,
    }


# ============ 统计（按 action 分组） ============

@router.get("/stats")
def audit_stats(
    days: int = Query(30, ge=1, le=365),
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """最近 N 天按 action 分组统计"""
    since = datetime.now() - timedelta(days=days)
    rows = (
        db.query(AuditLog.action, func.count(AuditLog.id).label("cnt"))
        .filter(AuditLog.created_at >= since)
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
        .all()
    )
    total = sum(r[1] for r in rows)
    return {
        "days": days,
        "total": total,
        "data": [
            {"action": r[0], "count": r[1], "percent": round(r[1] / total * 100, 2) if total else 0}
            for r in rows
        ],
    }


# ============ 导出 CSV ============

@router.get("/export")
def audit_export(
    action: Optional[str] = None,
    user_id: Optional[int] = None,
    keyword: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """导出 CSV（最多 10000 条）"""
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if keyword:
        q = q.filter(AuditLog.detail.like(f"%{keyword}%"))
    if start_date:
        try:
            sd = datetime.fromisoformat(start_date)
            q = q.filter(AuditLog.created_at >= sd)
        except ValueError:
            pass
    if end_date:
        try:
            ed = datetime.fromisoformat(end_date) + timedelta(days=1)
            q = q.filter(AuditLog.created_at < ed)
        except ValueError:
            pass

    rows = q.order_by(AuditLog.id.desc()).limit(10000).all()

    import csv
    import io
    buf = io.StringIO()
    buf.write("\ufeff")  # BOM for Excel
    writer = csv.writer(buf)
    writer.writerow(["ID", "用户ID", "操作", "详情", "IP", "时间"])
    for r in rows:
        writer.writerow([
            r.id, r.user_id, r.action or "", r.detail or "", r.ip or "",
            str(r.created_at) if r.created_at else "",
        ])

    csv_data = buf.getvalue()
    filename = f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
