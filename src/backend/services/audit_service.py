"""审计日志服务"""
from fastapi import Request
from sqlalchemy.orm import Session

from backend.models import AuditLog


def log_action(
    db: Session,
    user_id: int,
    action: str,
    detail: str = "",
    ip: str = "",
) -> None:
    """记录审计日志（同步写入，由调用方控制 commit 时机）"""
    db.add(AuditLog(
        user_id=user_id,
        action=action[:64],
        detail=detail[:2000],
        ip=ip[:45],
    ))


def log_from_request(
    db: Session,
    user_id: int,
    action: str,
    detail: str = "",
    request: Request = None,
) -> None:
    """从 FastAPI Request 提取 IP 后记录"""
    ip = ""
    if request is not None:
        ip = (
            request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            or request.client.host if request.client else ""
        )
    log_action(db, user_id, action, detail, ip)
