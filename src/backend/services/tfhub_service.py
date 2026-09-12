"""tradex-hub 数据桥接 service

通过 eltdx 通达信协议获取：
  - 实时行情快照（get_quote）
  - 集合竞价数据（get_auction）
  - 分时数据（get_minute）
  - K线数据（get_kline）
  - 全市场股票列表（get_stock_list）

设计要点：
  - 复用 eltdx.TdxClient 单例（首次调用建立连接，进程退出时清理）
  - 代码格式：sz000001 / sh600000（eltdx 私有协议要求）
  - 失败静默降级，返回 error 字段，不抛异常

依赖：
  - eltdx >= 1.2.0（pip install -e 安装的独立包）
"""
from __future__ import annotations

import atexit
import logging
import threading
from typing import Any, Dict, List, Optional

logger = logging.getLogger("tfhub_service")

try:
    from eltdx import TdxClient  # type: ignore
    _ELTDX_AVAILABLE = True
    _IMPORT_ERROR: str | None = None
except Exception as e:  # pragma: no cover
    _ELTDX_AVAILABLE = False
    _IMPORT_ERROR = str(e)
    TdxClient = None  # type: ignore


# ============ 客户端管理（单例） ============

_client: Optional[Any] = None
_client_lock = threading.Lock()


def _get_client():
    """获取/创建 eltdx TdxClient 单例。

    关闭 probe_hosts（避免冷启动慢），使用默认 host 列表。
    第一次调用时建立连接，后续复用。
    """
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is None:
            try:
                _client = TdxClient.from_hosts(timeout=8.0, pool_size=1)
                _client.connect()
                logger.info("eltdx TdxClient connected")
            except Exception as e:
                logger.error("eltdx client init failed: %s", e)
                _client = None
                return None
    return _client


def _shutdown_client() -> None:
    global _client
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None


atexit.register(_shutdown_client)


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
    """eltdx QuoteSnapshot -> dict（保持原对外字段）"""
    return {
        "code": code,
        "price": float(getattr(q, "last_price", 0) or 0),
        "change": float(getattr(q, "change", 0) or 0),
        "change_pct": float(getattr(q, "change_pct", 0) or 0),
        "open": float(getattr(q, "open_price", 0) or 0),
        "high": float(getattr(q, "high_price", 0) or 0),
        "low": float(getattr(q, "low_price", 0) or 0),
        "volume": int(getattr(q, "total_hand", 0) or 0),  # 单位：手
        "amount": float(getattr(q, "amount", 0) or 0),
        "inside": int(getattr(q, "inside_dish", 0) or 0),
        "outer": int(getattr(q, "outer_disc", 0) or 0),
    }


def _minute_to_dict(code: str, m: Any) -> Dict[str, Any]:
    """eltdx MinuteSeries -> dict（保持原对外字段）"""
    points = getattr(m, "points", None) or ()
    # MinuteSeries 没有 avg_price 字段，取最后一个 point 的 avg_price 作为整体均价
    last_avg = 0.0
    for p in reversed(points):
        avg = getattr(p, "avg_price", None)
        if avg:
            last_avg = float(avg)
            break
    trading_date = getattr(m, "trading_date", None)
    return {
        "code": code,
        "status": "success" if points else "no_data",
        "trading_date": str(trading_date) if trading_date else "",
        "prev_close": float(getattr(m, "prev_close", 0) or 0),
        "open_price": float(getattr(m, "open_price", 0) or 0),
        "avg_price": last_avg,
        "error_message": "",
        "points": [
            {
                "time_label": getattr(p, "time_label", ""),
                "price": float(getattr(p, "price", 0) or 0),
                "avg_price": float(getattr(p, "avg_price", 0) or 0),
                "volume": int(getattr(p, "volume", 0) or 0),
            }
            for p in points
        ],
    }


def _auction_to_dict(code: str, a: Any) -> Dict[str, Any]:
    """eltdx AuctionSeries -> dict（保持原对外字段）"""
    points = getattr(a, "points", None) or ()
    last_price = 0.0
    last_matched_volume = 0
    total_amount = 0.0
    if points:
        last = points[-1]
        last_price = float(getattr(last, "price", 0) or 0)
        last_matched_volume = int(getattr(last, "matched_volume", 0) or 0)
        for p in points:
            amt = getattr(p, "matched_amount_estimated", None)
            if amt is None:
                amt = float(getattr(p, "price", 0) or 0) * int(getattr(p, "matched_volume", 0) or 0) * 100.0
            total_amount += float(amt or 0)
    return {
        "code": code,
        "status": "success" if points else "no_data",
        "last_price": last_price,
        "last_matched_volume": last_matched_volume,
        "total_amount": total_amount,
        "error_message": "",
        "points": [
            {
                "time_label": getattr(p, "time_label", ""),
                "price": float(getattr(p, "price", 0) or 0),
                "matched_volume": int(getattr(p, "matched_volume", 0) or 0),
                "unmatched_volume": int(getattr(p, "unmatched_volume", 0) or 0),
                "matched_amount": float(getattr(p, "matched_amount_estimated", 0) or 0),
            }
            for p in points
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
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}"}

    client = _get_client()
    if client is None:
        return {"available": True, "error": "eltdx 客户端未连接", "quotes": []}

    normalized = [_normalize_code(c) for c in codes]
    try:
        quotes_list = client.get_quote(normalized)
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}", "quotes": []}

    # 按 full_code 建立映射（eltdx QuoteSnapshot.full_code 形如 "sh600000"）
    quotes_map: Dict[str, Any] = {}
    for q in quotes_list or []:
        key = getattr(q, "full_code", None) or f"{getattr(q, 'exchange', '')}{getattr(q, 'code', '')}"
        if key:
            quotes_map[str(key).lower()] = q

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
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}"}

    client = _get_client()
    if client is None:
        return {"available": True, "error": "eltdx 客户端未连接"}

    norm = _normalize_code(code)
    try:
        a = client.auctions.series(norm)
        return {"available": True, **_auction_to_dict(norm, a)}
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}"}


def get_minute(code: str) -> Dict[str, Any]:
    """获取分时数据"""
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}"}

    client = _get_client()
    if client is None:
        return {"available": True, "error": "eltdx 客户端未连接"}

    norm = _normalize_code(code)
    try:
        m = client.minutes.today(norm)
        return {"available": True, **_minute_to_dict(norm, m)}
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}"}


def get_stock_list() -> Dict[str, Any]:
    """获取全市场股票列表（eltdx TCP 协议，稳定可靠）

    Returns:
        {
            "available": True,
            "count": int,
            "codes": ["sh600000", "sz000001", ...],
        }
    """
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}", "count": 0, "codes": []}

    client = _get_client()
    if client is None:
        return {"available": True, "error": "eltdx 客户端未连接", "count": 0, "codes": []}

    try:
        codes = client.get_stock_codes_all()
        return {
            "available": True,
            "count": len(codes),
            "codes": codes,
        }
    except Exception as e:
        return {"available": True, "error": f"调用失败: {e}", "count": 0, "codes": []}


def health_check() -> Dict[str, Any]:
    """健康检查：拉取平安银行 000001 验证连通性"""
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}"}

    client = _get_client()
    if client is None:
        return {"available": True, "healthy": False, "error": "eltdx 客户端未连接"}

    try:
        quotes_list = client.get_quote(["sz000001"])
        for q in quotes_list or []:
            full = str(getattr(q, "full_code", "") or "").lower()
            if full == "sz000001":
                return {
                    "available": True,
                    "healthy": True,
                    "sample_code": "sz000001",
                    "sample_price": float(getattr(q, "last_price", 0) or 0),
                    "message": "eltdx 连通正常",
                }
        return {"available": True, "healthy": False, "message": "eltdx 连通但未返回数据"}
    except Exception as e:
        return {"available": True, "healthy": False, "error": str(e)}


def get_kline(code: str, period: str = "day", count: int = 500) -> Dict[str, Any]:
    """获取 K 线数据（通达信 TCP 协议，替代东方财富 HTTP 接口）

    Args:
        code: 股票代码（任意格式）
        period: K线周期，"day" / "week" / "month" / "5m" / "15m" / "30m" / "60m"
        count: 返回 K 线根数（默认 500）

    Returns:
        {
            "available": True,
            "code": str,
            "status": "success" | "no_data" | "error",
            "bars": [{date, open, high, low, close, volume, amount}, ...],
            "bar_count": int,
        }
    """
    if not _ELTDX_AVAILABLE:
        return {"available": False, "error": f"eltdx 不可用: {_IMPORT_ERROR}"}

    client = _get_client()
    if client is None:
        return {
            "available": True,
            "code": code,
            "original_code": code,
            "status": "error",
            "error": "eltdx 客户端未连接",
            "bars": [],
            "bar_count": 0,
        }

    norm = _normalize_code(code)
    try:
        kdata = client.bars.get(norm, period=period, count=count)
        bars = getattr(kdata, "bars", None) or ()
        if bars:
            bars_out = [
                {
                    # eltdx KlineBar 没有 date 字段，用 time(datetime) 序列化
                    "date": str(getattr(b, "time", "")),
                    "open": float(getattr(b, "open", 0) or 0),
                    "high": float(getattr(b, "high", 0) or 0),
                    "low": float(getattr(b, "low", 0) or 0),
                    "close": float(getattr(b, "close", 0) or 0),
                    # eltdx KlineBar 没有 volume 字段，volume_lots 为手数
                    "volume": float(getattr(b, "volume_lots", 0) or 0),
                    "amount": float(getattr(b, "amount", 0) or 0),
                }
                for b in bars
            ]
            return {
                "available": True,
                "code": norm,
                "original_code": code,
                "status": "success",
                "bars": bars_out,
                "bar_count": len(bars_out),
            }
        return {
            "available": True,
            "code": norm,
            "original_code": code,
            "status": "no_data",
            "error": "",
            "bars": [],
            "bar_count": 0,
        }
    except Exception as e:
        return {
            "available": True,
            "code": norm,
            "original_code": code,
            "status": "error",
            "error": str(e),
            "bars": [],
            "bar_count": 0,
        }
