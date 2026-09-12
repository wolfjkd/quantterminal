"""东方财富行情数据服务

接入东方财富公开接口：
  - push2his: K 线历史数据
  - push2 clist: 股票列表（全市场扩容）
  - 实时报价：push2 qt stock get

仅使用 Python 标准库 urllib，无外部依赖。
失败自动多 host 兜底（push2 / push2delay / push2his / 82.push2his）。
"""
from __future__ import annotations

import json
import urllib.request
import urllib.error
from datetime import date
from typing import Any, Dict, List, Optional, Tuple


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
UT = "fa5fd1943c7b386f172d6893dbfba10b"

# 多 host 兜底：列表/实时走 push2，K线走 push2his
_PUSH2_HOSTS = [
    "https://push2.eastmoney.com",
    "https://push2delay.eastmoney.com",
    "http://push2.eastmoney.com",
]
_PUSH2HIS_HOSTS = [
    "https://push2his.eastmoney.com",
    "https://82.push2his.eastmoney.com",
    "https://push2hisdelay.eastmoney.com",
    "http://push2his.eastmoney.com",
    "http://82.push2his.eastmoney.com",
]


def _http_get(url: str, timeout: int = 8) -> Optional[dict]:
    """HTTP GET 返回 JSON dict；失败返回 None"""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://quote.eastmoney.com/",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Connection": "close",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None
    if not body:
        return None
    # 去 BOM
    body = body.lstrip("\ufeff")
    try:
        return json.loads(body)
    except (ValueError, json.JSONDecodeError):
        return None


def _http_get_multi(path: str, hosts: List[str], timeout: int = 8) -> Optional[dict]:
    """对多个 host 依次尝试，第一个成功即返回"""
    for host in hosts:
        url = host + path
        data = _http_get(url, timeout=timeout)
        if data and isinstance(data, dict):
            return data
    return None


def parse_code(code: str) -> Tuple[str, str, str]:
    """解析股票代码，返回 (symbol, market, full_code)

    支持：'600000' / '600000.SH' / 'sh600000'
    """
    code = (code or "").upper().strip()
    if "." in code:
        num, mkt = code.split(".", 1)
        return num, mkt, f"{num}.{mkt}"
    num = "".join(c for c in code if c.isdigit())
    if num.startswith(("5", "6", "9")):
        mkt = "SH"
    elif num.startswith(("0", "3")):
        mkt = "SZ"
    elif num.startswith(("4", "8")):
        mkt = "BJ"
    else:
        mkt = "SZ"
    return num, mkt, f"{num}.{mkt}"


def to_secid(code: str) -> str:
    """转换为东方财富 secid 格式：'1.600000' (SH) / '0.000001' (SZ)"""
    num, mkt, _ = parse_code(code)
    if mkt == "SH":
        return f"1.{num}"
    if mkt == "BJ":
        return f"0.{num}"
    return f"0.{num}"


def detect_board(code: str) -> str:
    """识别板块：main/gem/star/bse"""
    num, mkt, _ = parse_code(code)
    if num.startswith(("300", "301")):
        return "gem"
    if num.startswith("688"):
        return "star"
    if mkt == "BJ" or num.startswith(("4", "8")):
        return "bse"
    return "main"


def fetch_kline(
    code: str,
    beg: str = "19900101",
    end: Optional[str] = None,
    fqt: int = 1,
) -> List[Dict[str, Any]]:
    """拉取日K线（对外接口，符合 task spec）

    Args:
        code: 股票代码
        beg: 起始日期 YYYYMMDD
        end: 结束日期 YYYYMMDD，默认今天
        fqt: 复权 0=不复权 1=前复权 2=后复权

    Returns:
        bars: [{date, open, high, low, close, volume, amount, pct_change, pre_close, adj_factor}, ...]
        失败时返回空列表 []
    """
    bars, _name, _err = fetch_kline_full(code, beg=beg, end=end, fqt=fqt)
    return bars


def _fetch_kline_eastmoney(
    code: str,
    beg: str = "19900101",
    end: Optional[str] = None,
    fqt: int = 1,
) -> Tuple[List[Dict[str, Any]], str, Optional[str]]:
    """通过东方财富 push2his 接口拉取日K线（备用方案）"""
    if end is None or end == "":
        end = date.today().strftime("%Y%m%d")
    secid = to_secid(code)

    templates = [
        f"/api/qt/stock/kline/get?secid={secid}&ut={UT}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
        f"&klt=101&fqt={int(fqt)}&beg={beg}&end={end}&lmt=100000",
        f"/api/qt/stock/kline/get?secid={secid}&ut={UT}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
        f"&klt=101&fqt={int(fqt)}&end=20500101&lmt=1000",
        f"/api/qt/stock/kline/get?secid={secid}"
        f"&fields1=f1,f2,f3,f4,f5,f6"
        f"&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
        f"&klt=101&fqt={int(fqt)}&beg={beg}&end={end}",
    ]

    data = None
    for tpl in templates:
        data = _http_get_multi(tpl, _PUSH2HIS_HOSTS, timeout=8)
        if data and data.get("data") and data["data"].get("klines"):
            break
        data = None

    if not data or not data.get("data") or not data["data"].get("klines"):
        return [], "", f"东方财富接口无数据或网络不可达：{code}"

    name = data["data"].get("name", "") or ""
    klines = data["data"]["klines"]

    beg_norm = ""
    if beg and len(beg) == 8:
        beg_norm = f"{beg[0:4]}-{beg[4:6]}-{beg[6:8]}"

    bars: List[Dict[str, Any]] = []
    prev_close: Optional[float] = None
    for line in klines:
        parts = line.split(",")
        if len(parts) < 7:
            continue
        d_str = parts[0]
        if beg_norm and d_str < beg_norm:
            continue
        try:
            o = float(parts[1])
            h = float(parts[2])
            low = float(parts[3])
            c = float(parts[4])
            vol = int(float(parts[5]))
            amt = float(parts[6]) if len(parts) > 6 else 0.0
        except (ValueError, IndexError):
            continue

        vol_shares = vol * 100 if vol > 0 else 0
        if h < max(o, c):
            h = max(o, c)
        if low > min(o, c) or low <= 0:
            low = min(o, c)

        pre_close = prev_close if prev_close is not None else o
        pct = round((c - pre_close) / pre_close * 100, 4) if pre_close > 0 else 0.0

        bars.append({
            "date": d_str,
            "open": round(o, 4),
            "high": round(h, 4),
            "low": round(low, 4),
            "close": round(c, 4),
            "volume": vol_shares,
            "amount": round(amt, 2),
            "pre_close": round(pre_close, 4),
            "pct_change": pct,
            "adj_factor": 1.0,
        })
        prev_close = c

    if not bars:
        return [], name, f"过滤后无 K 线：{code}"
    return bars, name, None


def fetch_kline_full(
    code: str,
    beg: str = "19900101",
    end: Optional[str] = None,
    fqt: int = 1,
) -> Tuple[List[Dict[str, Any]], str, Optional[str]]:
    """拉取日K线（内部接口，附带股票名称与错误信息）

    优先使用通达信 eltdx TCP 协议（更稳定），失败后回退到东方财富 HTTP 接口。

    Returns:
        (bars, name, err)
        bars: [{date, open, high, low, close, volume, amount, pct_change, pre_close, adj_factor}, ...]
        name: 股票名称
        err: 失败时返回错误信息字符串，成功时为 None
    """
    # ============ 优先：通达信 eltdx TCP 协议 ============
    try:
        from backend.services import tfhub_service
        if tfhub_service.is_available():
            result = tfhub_service.get_kline(code, period="day", count=500)
            if result.get("status") == "success" and result.get("bars"):
                name = result.get("code", code)
                bars = result["bars"]
                prev_close: Optional[float] = None
                processed: List[Dict[str, Any]] = []
                for b in bars:
                    pre_close_val = prev_close if prev_close is not None else b["open"]
                    pct = round((b["close"] - pre_close_val) / pre_close_val * 100, 4) if pre_close_val > 0 else 0.0
                    processed.append({
                        "date": b["date"],
                        "open": round(b["open"], 4),
                        "high": round(b["high"], 4),
                        "low": round(b["low"], 4),
                        "close": round(b["close"], 4),
                        "volume": b["volume"],
                        "amount": round(b["amount"], 2),
                        "pre_close": round(pre_close_val, 4),
                        "pct_change": pct,
                        "adj_factor": 1.0,
                    })
                    prev_close = b["close"]
                if processed:
                    return processed, name, None
    except Exception:
        pass

    # ============ 兜底：东方财富 HTTP 接口 ============
    return _fetch_kline_eastmoney(code, beg=beg, end=end, fqt=fqt)


def fetch_stock_list() -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """拉取沪深A股全市场列表

    优先使用 eltdx TCP 协议（稳定可靠，可获取 5000+ 只股票代码），
    失败后回退到东方财富 HTTP 接口。

    Returns:
        (rows, err)
        rows: [{code, symbol, name, market, board, is_st, industry}, ...]
    """
    # ============ 优先：eltdx TCP 协议 ============
    try:
        from backend.services import tfhub_service
        if tfhub_service.is_available():
            result = tfhub_service.get_stock_list()
            if result.get("available") and result.get("count", 0) > 0:
                codes = result.get("codes", [])
                out: List[Dict[str, Any]] = []
                for code in codes:
                    # 代码格式：sh600000 / sz000001
                    code = code.strip().lower()
                    if code.startswith("sh") and len(code) == 8:
                        symbol = code[2:]
                        market = "SH"
                    elif code.startswith("sz") and len(code) == 8:
                        symbol = code[2:]
                        market = "SZ"
                    elif code.startswith("bj") and len(code) == 8:
                        symbol = code[2:]
                        market = "BJ"
                    else:
                        continue
                    if not symbol.isdigit():
                        continue
                    full_code = f"{symbol}.{market}"
                    out.append({
                        "code": full_code,
                        "symbol": symbol,
                        "name": "",  # eltdx 只返回代码，名称需要后续补充
                        "market": market,
                        "board": detect_board(full_code),
                        "is_st": 0,
                        "industry": "",
                    })
                if out:
                    return out, None
    except Exception:
        pass

    # ============ 兜底：东方财富 HTTP 接口 ============
    path = (
        "/api/qt/clist/get?pn=1&pz=10000&po=1&np=1"
        "&ut=bd1d9ddb04089700cf9c27f6f7426281"
        "&fltt=2&invt=2&fid=f3"
        "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
        "&fields=f12,f13,f14,f100,f152"
    )
    data = _http_get_multi(path, _PUSH2_HOSTS, timeout=10)
    if not data or not data.get("data") or not data["data"].get("diff"):
        return [], "全市场列表接口无数据或网络不可达"

    rows = data["data"]["diff"]
    out: List[Dict[str, Any]] = []
    for r in rows:
        symbol = str(r.get("f12", "") or "").strip()
        if not symbol or len(symbol) != 6 or not symbol.isdigit():
            continue
        name = str(r.get("f14", "") or "").strip()
        if not name or "退" in name:
            continue
        mkt_flag = int(r.get("f13", 0) or 0)
        market_str = "SH" if mkt_flag == 1 else "SZ" if mkt_flag == 0 else "BJ"
        full_code = f"{symbol}.{market_str}"
        out.append({
            "code": full_code,
            "symbol": symbol,
            "name": name,
            "market": market_str,
            "board": detect_board(full_code),
            "is_st": 1 if ("ST" in name or "*ST" in name) else 0,
            "industry": str(r.get("f100", "") or "").strip(),
        })
    if not out:
        return [], "全市场列表过滤后为空"
    return out, None


def fetch_realtime_quote(code: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """实时报价快照

    Returns:
        (quote, err)
        quote: {code, name, price, pct_change, open, high, low, pre_close, volume, amount, turnover, as_of, source}
    """
    secid = to_secid(code)
    path = (
        f"/api/qt/stock/get?secid={secid}&ut={UT}"
        "&fields=f57,f58,f43,f44,f45,f46,f47,f48,f60,f168,f170"
    )
    data = _http_get_multi(path, _PUSH2_HOSTS, timeout=6)
    if not data or not data.get("data"):
        return {}, f"实时行情暂不可用：{code}"

    d = data["data"]

    def _num(v: Any) -> Optional[float]:
        if v is None or v == "" or v == "-":
            return None
        try:
            return float(v)
        except (ValueError, TypeError):
            return None

    def _price(v: Any) -> Optional[float]:
        """价格类字段，东财 push2 接口始终 *100（分→元）"""
        n = _num(v)
        if n is None:
            return None
        return round(n / 100.0, 4)

    def _pct(v: Any) -> Optional[float]:
        """涨跌幅/换手率字段，东财 push2 接口始终 *100"""
        n = _num(v)
        if n is None:
            return None
        return round(n / 100.0, 4)

    def _volume(v: Any) -> Optional[float]:
        """成交量字段，东财 push2 接口单位为手，转换为股"""
        n = _num(v)
        if n is None:
            return None
        return n * 100

    full_code = parse_code(code)[2]
    return {
        "code": full_code,
        "symbol": str(d.get("f57", "") or parse_code(code)[0]),
        "name": str(d.get("f58", "") or full_code),
        "price": _price(d.get("f43")),
        "high": _price(d.get("f44")),
        "low": _price(d.get("f45")),
        "open": _price(d.get("f46")),
        "pre_close": _price(d.get("f60")),
        "volume": _volume(d.get("f47")),
        "amount": _num(d.get("f48")),
        "turnover": _pct(d.get("f168")),
        "pct_change": _pct(d.get("f170")),
        "as_of": date.today().isoformat(),
        "source": "eastmoney",
    }, None
