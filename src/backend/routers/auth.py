"""认证 router：登录 / 当前用户 / 注销 / 修改密码"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import (
    create_access_token, verify_password, hash_password,
    get_current_user,
)
from backend.services.audit_service import log_from_request

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserInfo(BaseModel):
    id: int
    username: str
    realname: str
    role: str
    phone: str
    status: int


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """OAuth2 password flow：用户名密码换 JWT"""
    user = db.query(User).filter_by(username=payload.username).first()
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已禁用",
        )

    token = create_access_token(user.id, user.username, user.role)
    log_from_request(db, user.id, "login", f"用户 {user.username} 登录", request)
    db.commit()

    return LoginResponse(
        access_token=token,
        user={
            "id": user.id,
            "username": user.username,
            "realname": user.realname,
            "role": user.role,
            "phone": user.phone,
            "status": user.status,
        },
    )


@router.get("/me", response_model=UserInfo)
def me(user: User = Depends(get_current_user)):
    return UserInfo(
        id=user.id, username=user.username, realname=user.realname,
        role=user.role, phone=user.phone, status=user.status,
    )


@router.post("/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """注销：JWT 是无状态的，这里只记审计日志"""
    log_from_request(db, user.id, "logout", f"用户 {user.username} 注销", request)
    db.commit()
    return {"message": "已注销"}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.old_password, user.password):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    user.password = hash_password(payload.new_password)
    user.updated_at = datetime.now(timezone.utc)
    log_from_request(db, user.id, "change_password", "", request)
    db.commit()
    return {"message": "密码已修改"}
