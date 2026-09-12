"""实时分析 router - 单股深度分析 + 通达信实时行情

基于 daily_bars 最新数据：
  - GET /realtime/{code}              最新行情 + 涨跌 + 均线 + 年内高低 + 近 60 日 K 线
  - GET /realtime/tfhub/health        通达信行情源健康检查
  - POST /realtime/tfhub/quote        批量实时行情快照（eltdx 协议）
  - GET /realtime/tfhub/auction/{code} 集合竞价数据（eltdx 独有）
  - GET /realtime/tfhub/minute/{code}  分时数据（eltdx 独有）
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.auth_service import get_current_user
from backend.services import realtime_service, tfhub_service

router = APIRouter(prefix="/realtime", tags=["realtime"])


# ============ 基础：基于本地数据的单股分析 ============

@router.get("/{code}")
def realtime_stock(
    code: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """单股深度分析"""
    res = realtime_service.stock_detail(db, code)
    if "error" in res:
        raise HTTPException(status_code=404, detail=res["error"])
    return res


# ============ 通达信实时行情源（eltdx 协议） ============

class QuoteRequest(BaseModel):
    codes: List[str]


@router.get("/tfhub/health")
def tfhub_health(user: User = Depends(get_current_user)):
    """通达信行情源健康检查"""
    return tfhub_service.health_check()


@router.post("/tfhub/quote")
def tfhub_quote(
    req: QuoteRequest,
    user: User = Depends(get_current_user),
):
    """批量实时行情快照（eltdx 协议）

    Body: {"codes": ["600170", "000001", "sh601868"]}
    """
    if not req.codes:
        raise HTTPException(status_code=400, detail="codes 不能为空")
    return tfhub_service.get_quote(req.codes)


@router.get("/tfhub/auction/{code}")
def tfhub_auction(
    code: str,
    user: User = Depends(get_current_user),
):
    """集合竞价数据（eltdx 独有，腾讯接口无此功能）"""
    return tfhub_service.get_auction(code)


@router.get("/tfhub/minute/{code}")
def tfhub_minute(
    code: str,
    user: User = Depends(get_current_user),
):
    """分时数据（eltdx 独有）"""
    return tfhub_service.get_minute(code)


@router.get("/tfhub/kline/{code}")
def tfhub_kline(
    code: str,
    period: str = "day",
    count: int = 500,
    user: User = Depends(get_current_user),
):
    """K线数据（通达信 TCP 协议，替代东方财富 HTTP 接口）

    Args:
        code: 股票代码（任意格式）
        period: K线周期，"day" / "week" / "month" / "5m" / "15m" / "30m" / "60m"
        count: 返回 K 线根数（默认 500）
    """
    return tfhub_service.get_kline(code, period=period, count=count)
