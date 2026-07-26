"""trader-finance-hub 数据桥接 service

通过动态导入 trader-finance-hub 的 eltdx_provider 模块，调用通达信行情协议获取：
  - 实时行情快照（get_quote）
  - 集合竞价数据（get_auction）
  - 分时数据（get_minute）

设计要点：
  - 每次请求新建 EltdxProvider 连接（eltdx TCP 连接 < 50ms，无需长连接）
  - 代码格式：sz000001 / sh600000（eltdx 私有协议要求）
  - 失败静默降级，返回 error 字段，不抛异常
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

# 动态加载 trader-finance-hub/src 到 sys.path
_TFH_SRC = Path(r"C:\Users\wolfj\Documents\trae_projects\trader-finance-hub\src")
if str(_TFH_SRC) not in sys.path:
    sys.path.insert(0, str(_TFH_SRC))

try:
    from eltdx_provider import EltdxProvider, QuoteSnapshot, MinuteData, AuctionData  # type: ignore
    _ELTDX_AVAILABLE = True
    _IMPORT_ERROR: str | None = None
except Exception as e:  # pragma: no cover
    _ELTDX_AVAILABLE = False
    _IMPORT_ERROR = str(e)


# ============ 工具 ============

def _normalize_code(code: str) -> str:
    """将任意格式的股票代码统一为 eltdx 格式 sz000001 / sh600000

    支持：
      - 600170 / 000001（6位纯数字）
      - sh600000 / sz000001（已带前缀）
      - 600170.SH / 000001.SZ（带后缀）
    """
    code = code.strip().upper()
    if code.startswith(("SH", "SZ")):
        return code.lower()
    if code.endswith((".SH", ".SZ")):
        prefix, _, suffix = code.partition(".")
        return f"{suffix.lower()}{prefix}"
    # 纯数字：6开头=sh，0/3开头=sz
    if code.isdigit() and len(code) == 6:
        if code.startswith(("60", "68", "90")):
            return f"sh{code}"
        return f"sz{code}"
    return code.lower()


def _quote_to_dict(code: str, q: Any) -> Dict[str, Any]:
    """QuoteSnapshot -> dict"""
    return {
        "code": code,
        "price": float(getattr(q, "price", 0) or 0),
        "change": float(getattr(q, "change", 0) or 0),
        "change_pct": float(getattr(q, "change_pct", 0) or 0),
        "open": float(getattr(q, "open", 0) or 0),
        "high": float(getattr(q, "high", 0) or 0),
        "low": float(getattr(q, "low", 0) or 0),
        "volume": int(getattr(q, "volume", 0) or 0),  # 单位：手
        "amount": float(getattr(q, "amount", 0) or 0),
        "inside": int(getattr(q, "inside", 0) or 0),
        "outer": int(getattr(q, "outer", 0) or 0),
    }


def _minute_to_dict(m: Any) -> Dict[str, Any]:
    """MinuteData -> dict"""
    return {
        "code": getattr(m, "code", ""),
        "status": getattr(m, "status", "error"),
        "trading_date": getattr(m, "trading_date", ""),
        "prev_close": float(getattr(m, "prev_close", 0) or 0),
        "open_price": float(getattr(m, "open_price", 0) or 0),
        "avg_price": float(getattr(m, "avg_price", 0) or 0),
        "error_message": getattr(m, "error_message", ""),
        "points": [
            {
                "time_label": p.time_label,
                "price": float(p.price),
                "avg_price": float(p.avg_price),
                "volume": int(p.volume),
            }
            for p in (getattr(m, "points", []) or [])
        ],
    }


def _auction_to_dict(a: Any) -> Dict[str, Any]:
    """AuctionData -> dict"""
    return {
        "code": getattr(a, "code", ""),
        "status": getattr(a, "status", "error"),
        "last_price": float(getattr(a, "last_price", 0) or 0),
        "last_matched_volume": int(getattr(a, "last_matched_volume", 0) or 0),
        "total_amount": float(getattr(a, "total_amount", 0) or 0),
        "error_message": getattr(a, "error_message", ""),
        "points": [
            {
                "time_label": p.time_label,
                "price": float(p.price),
                "matched_volume": int(p.matched_volume or 0),
                "unmatched_volume": int(p.unmatched_volume or 0),
                "matched_amount": float(p.matched_amount or 0),
            }
            for p in (getattr(a, "points", []) or [])
        ],
    }


# ============ 对外接口 ============

def is_available() -> bool:
    return _ELTDX_AVAILABLE


def import_error() -> str | None:
    return _IMPORT_ERROR


def get_quote(codes: List[str]) -> Dict[str, Any]:
    """批量获取行情快照

    Args:
        codes: 股票代码列表（任意格式）

    Returns:
        {
            "available": True,
            "requested": N,
            "returned": M,
            "quotes": [{...}, ...],
            "missing": [code, ...],
        }
    """
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx_provider 不可用: {_IMPORT_ERROR}"}

    normalized = [_normalize_code(c) for c in codes]
    try:
        with EltdxProvider() as provider:
            quotes_map = provider.get_quote(normalized)
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}", "quotes": []}

    result_quotes = []
    for orig, norm in zip(codes, normalized):
        q = quotes_map.get(norm)
        if q:
            d = _quote_to_dict(norm, q)
            d["original_code"] = orig
            result_quotes.append(d)

    return {
        "available": True,
        "requested": len(codes),
        "returned": len(result_quotes),
        "quotes": result_quotes,
        "missing": [c for c, n in zip(codes, normalized) if n not in quotes_map],
    }


def get_auction(code: str) -> Dict[str, Any]:
    """获取集合竞价数据"""
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx_provider 不可用: {_IMPORT_ERROR}"}

    norm = _normalize_code(code)
    try:
        with EltdxProvider() as provider:
            a = provider.get_auction(norm)
        return {"available": True, **_auction_to_dict(a)}
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}"}


def get_minute(code: str) -> Dict[str, Any]:
    """获取分时数据"""
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx_provider 不可用: {_IMPORT_ERROR}"}

    norm = _normalize_code(code)
    try:
        with EltdxProvider() as provider:
            m = provider.get_minute(norm)
        return {"available": True, **_minute_to_dict(m)}
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}"}


def health_check() -> Dict[str, Any]:
    """健康检查：拉取平安银行 000001 验证连通性"""
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx_provider 不可用: {_IMPORT_ERROR}"}

    try:
        with EltdxProvider() as provider:
            quotes = provider.get_quote(["sz000001"])
        if "sz000001" in quotes:
            q = quotes["sz000001"]
            return {
                "available": True,
                "healthy": True,
                "sample_code": "sz000001",
                "sample_price": float(q.price or 0),
                "message": "eltdx 连通正常",
            }
        return {"available": True, "healthy": False, "message": "eltdx 连通但未返回数据"}
    except Exception as e:
        return {"available": True, "healthy": False, "error": str(e)}
