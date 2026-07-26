"""认证服务：密码哈希 / JWT 生成校验 / 当前用户依赖"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS

# OAuth2 password flow（前端用 username+password 换 token）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ============ 密码 ============

class pwd_context:
    """占位类：保留 pwd_context.hash/verify 接口，避免 init_db.py 改动。

    内部直接调用 bcrypt 原生 API，避免 passlib 与 bcrypt 4.x 的兼容问题。
    """


def verify_password(plain: str, hashed: str) -> bool:
    """校验密码

    兼容三种情况：
    1. PHP $2y$10$... bcrypt 哈希（前缀 $2y$ → 改 $2b$ 后可校验）
    2. 本系统 bcrypt $2b$...
    3. 明文（仅开发期，不推荐）
    """
    if not hashed:
        return False
    h = hashed
    if h.startswith("$2y$"):
        h = "$2b$" + h[4:]
    # 明文兼容
    if not h.startswith("$2"):
        return plain == h
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def hash_password(plain: str) -> str:
    """生成 bcrypt 哈希（$2b$ 前缀，与 PHP password_verify 兼容）"""
    # bcrypt 限制 72 字节，截断
    pwd_bytes = plain.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


# 兼容 init_db.py 调用
pwd_context.hash = hash_password
pwd_context.verify = verify_password


# ============ JWT ============

def create_access_token(user_id: int, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ============ FastAPI 依赖 ============

def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """从 Bearer Token 解析当前用户"""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token 已过期或无效",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload.get("sub", 0))
    user = db.query(User).filter_by(id=user_id, status=1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已禁用",
        )
    return user


def require_role(*roles: str):
    """角色守卫：require_role('admin') / require_role('admin', 'analyst')"""
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要 {','.join(roles)} 角色权限",
            )
        return user
    return _dep
