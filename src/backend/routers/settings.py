"""系统设置 router

  - 系统参数 CRUD（仅管理员可改）
  - 用户管理 CRUD（仅管理员）
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from backend.models import User, SystemSetting
from backend.database import get_db
from sqlalchemy.orm import Session
from backend.services.auth_service import get_current_user, require_role, hash_password
from backend.services.audit_service import log_action

router = APIRouter(prefix="/settings", tags=["settings"])


# ============ 系统参数 ============

class SettingUpdate(BaseModel):
    setting_value: str
    remark: Optional[str] = None


class SettingCreate(BaseModel):
    setting_key: str
    setting_value: str
    remark: str = ""


@router.get("")
def settings_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(SystemSetting).order_by(SystemSetting.id).all()
    return {
        "data": [
            {
                "id": r.id, "key": r.setting_key, "value": r.setting_value,
                "remark": r.remark,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.post("")
def setting_create(req: SettingCreate, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    if db.query(SystemSetting).filter_by(setting_key=req.setting_key).first():
        raise HTTPException(status_code=400, detail="参数键已存在")
    s = SystemSetting(
        setting_key=req.setting_key, setting_value=req.setting_value, remark=req.remark,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    log_action(db, user.id, "setting_create", f"新增参数 {req.setting_key}")
    db.commit()
    return {"id": s.id, "key": s.setting_key}


@router.put("/{key}")
def setting_update(
    key: str,
    payload: SettingUpdate,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    s = db.query(SystemSetting).filter_by(setting_key=key).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"参数 {key} 不存在")
    s.setting_value = payload.setting_value
    if payload.remark is not None:
        s.remark = payload.remark
    log_action(db, user.id, "setting_update", f"修改参数 {key}={payload.setting_value}")
    db.commit()
    return {"message": "已更新", "key": key, "value": payload.setting_value}


@router.delete("/{key}")
def setting_delete(key: str, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    s = db.query(SystemSetting).filter_by(setting_key=key).first()
    if not s:
        raise HTTPException(status_code=404, detail=f"参数 {key} 不存在")
    db.delete(s)
    log_action(db, user.id, "setting_delete", f"删除参数 {key}")
    db.commit()
    return {"key": key, "deleted": True}


# ============ 交易参数（11 个固定参数，用于回测/组合计算） ============

TRADING_PARAMS_META: list[dict] = [
    {
        "key": "commission_rate",
        "label": "佣金费率",
        "default": "0.0003",
        "unit": "比例",
        "description": "万三，按成交额比例",
        "input_type": "number",
    },
    {
        "key": "min_commission",
        "label": "最低佣金",
        "default": "5",
        "unit": "元",
        "description": "单笔佣金不足此值按此值收",
        "input_type": "number",
    },
    {
        "key": "stamp_tax_rate",
        "label": "印花税率",
        "default": "0.0005",
        "unit": "比例",
        "description": "千分之 0.5，仅卖出收取",
        "input_type": "number",
    },
    {
        "key": "slippage_bps",
        "label": "滑点",
        "default": "0",
        "unit": "基点",
        "description": "1bp=0.01%，模拟成交价偏差",
        "input_type": "number",
    },
    {
        "key": "risk_free_rate",
        "label": "无风险年化利率",
        "default": "0.02",
        "unit": "比例",
        "description": "用于夏普比率计算",
        "input_type": "number",
    },
    {
        "key": "trading_days_year",
        "label": "年化交易日",
        "default": "242",
        "unit": "天",
        "description": "一年的交易日数",
        "input_type": "number",
    },
    {
        "key": "initial_cash",
        "label": "初始资金",
        "default": "1000000",
        "unit": "元",
        "description": "默认回测/组合初始资金",
        "input_type": "number",
    },
    {
        "key": "lot_size",
        "label": "每手股数",
        "default": "100",
        "unit": "股",
        "description": "A 股 1 手 = 100 股",
        "input_type": "number",
    },
    {
        "key": "board_limit_main",
        "label": "主板涨跌幅",
        "default": "0.10",
        "unit": "比例",
        "description": "10%",
        "input_type": "number",
    },
    {
        "key": "board_limit_gem",
        "label": "创业/科创涨跌幅",
        "default": "0.20",
        "unit": "比例",
        "description": "20%",
        "input_type": "number",
    },
    {
        "key": "fill_price",
        "label": "回测成交价",
        "default": "next_open",
        "unit": "枚举",
        "description": "next_open 或 close",
        "input_type": "select",
        "options": ["next_open", "close"],
    },
]


@router.get("/trading-params")
def trading_params_meta(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """交易参数元数据（11 个固定参数），合并数据库当前值"""
    rows = db.query(SystemSetting).filter(
        SystemSetting.setting_key.in_([m["key"] for m in TRADING_PARAMS_META])
    ).all()
    db_values = {r.setting_key: r.setting_value for r in rows}
    data = []
    for meta in TRADING_PARAMS_META:
        current = db_values.get(meta["key"], meta["default"])
        data.append({
            "key": meta["key"],
            "label": meta["label"],
            "default": meta["default"],
            "unit": meta["unit"],
            "description": meta["description"],
            "input_type": meta["input_type"],
            "options": meta.get("options"),
            "current": current,
            "is_default": current == meta["default"],
        })
    return {"data": data, "count": len(data)}


@router.put("/trading-params")
def trading_params_update(
    payload: dict,
    user: User = Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """批量保存交易参数（upsert 到 system_settings 表）"""
    valid_keys = {m["key"] for m in TRADING_PARAMS_META}
    updates = {k: str(v) for k, v in payload.items() if k in valid_keys}
    if not updates:
        raise HTTPException(status_code=400, detail="没有可更新的交易参数")
    changed = []
    for key, value in updates.items():
        s = db.query(SystemSetting).filter_by(setting_key=key).first()
        if s:
            s.setting_value = value
        else:
            s = SystemSetting(
                setting_key=key,
                setting_value=value,
                remark=f"交易参数：{next((m['label'] for m in TRADING_PARAMS_META if m['key'] == key), key)}",
            )
            db.add(s)
        changed.append(f"{key}={value}")
    log_action(db, user.id, "trading_params_update", "批量更新交易参数：" + ", ".join(changed))
    db.commit()
    return {"updated": updates, "count": len(updates)}


# ============ 用户管理（仅管理员） ============

class UserCreate(BaseModel):
    username: str
    password: str
    realname: str = ""
    role: str = "user"
    phone: str = ""
    status: int = 1


class UserUpdate(BaseModel):
    realname: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[int] = None
    password: Optional[str] = None  # 若提供则重置密码


@router.get("/users")
def users_list(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    rows = db.query(User).order_by(User.id).all()
    return {
        "data": [
            {
                "id": r.id, "username": r.username, "realname": r.realname,
                "role": r.role, "phone": r.phone, "status": r.status,
                "created_at": str(r.created_at) if r.created_at else None,
                "updated_at": str(r.updated_at) if r.updated_at else None,
            }
            for r in rows
        ],
        "count": len(rows),
    }


@router.post("/users")
def user_create(req: UserCreate, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    if db.query(User).filter_by(username=req.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    u = User(
        username=req.username,
        password=hash_password(req.password),
        realname=req.realname, role=req.role, phone=req.phone, status=req.status,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    log_action(db, user.id, "user_create", f"新增用户 {req.username}")
    db.commit()
    return {"id": u.id, "username": u.username}


@router.put("/users/{uid}")
def user_update(uid: int, req: UserUpdate, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    u = db.query(User).filter_by(id=uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    data = req.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        u.password = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(u, k, v)
    log_action(db, user.id, "user_update", f"修改用户 {u.username}")
    db.commit()
    return {"id": u.id, "updated": list(data.keys())}


@router.delete("/users/{uid}")
def user_delete(uid: int, user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    u = db.query(User).filter_by(id=uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if u.id == user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    if u.role == "admin" and u.id == 1:
        raise HTTPException(status_code=400, detail="不能删除超级管理员")
    log_action(db, user.id, "user_delete", f"删除用户 {u.username}")
    db.delete(u)
    db.commit()
    return {"id": uid, "deleted": True}
