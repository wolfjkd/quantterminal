"""模拟组合 service

  - 列表：含 market_value / equity / 盈亏
  - 详情：positions / fills / orders / stocks / mv / equity
  - 创建组合
  - 下单（buy/sell）：T+1 检查、涨跌停检查、费用计算、资金/持仓更新、订单/成交/权益点记录
  - 日终解冻：持仓全部变为可卖
  - 权益曲线：最近 N 日

规则：
  - 即时按最新收盘价撮合
  - T+1：买入当日 available_qty 不变，需日终解冻
  - 涨跌停：主板 10%，创业/科创 20%
  - 费用：佣金 max(成交额*费率, 最低佣金) + 卖方印花税
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.models import (
    Stock, DailyBar, SystemSetting,
    Portfolio, PortfolioPosition, PortfolioOrder, PortfolioFill, PortfolioEquity,
)
from backend.services.audit_service import log_action


# ============ 系统交易参数 ============

DEFAULTS: Dict[str, Any] = {
    "commission_rate": 0.0003,
    "min_commission": 5.0,
    "stamp_tax_rate": 0.0005,
    "slippage_bps": 0,
    "risk_free_rate": 0.02,
    "trading_days_year": 242,
    "initial_cash": 1_000_000.0,
    "lot_size": 100,
    "board_limit_main": 0.10,
    "board_limit_gem": 0.20,
    "fill_price": "next_open",
}


def get_trading_settings(db: Session) -> Dict[str, Any]:
    """从 system_settings 读取交易参数（带默认值）"""
    rows = db.query(SystemSetting).all()
    mapping = {r.setting_key: r.setting_value for r in rows}
    out: Dict[str, Any] = {}
    for k, default in DEFAULTS.items():
        v = mapping.get(k, "")
        if v == "" or v is None:
            out[k] = default
        else:
            if isinstance(default, float):
                out[k] = float(v)
            elif isinstance(default, int):
                out[k] = int(v)
            else:
                out[k] = v
    return out


# ============ 工具：金额/价格运算 ============

def _round4(v: float) -> float:
    return round(float(v or 0), 4)


def _round2(v: float) -> float:
    return round(float(v or 0), 2)


def apply_slippage(price: float, bps: float, side: str) -> float:
    """买入加价、卖出减价"""
    factor = bps / 10000.0
    if side == "buy":
        return _round4(price * (1 + factor))
    return _round4(price * (1 - factor))


def calc_commission(amount: float, rate: float, min_comm: float) -> float:
    return _round4(max(amount * rate, min_comm))


def calc_stamp_tax(amount: float, rate: float) -> float:
    return _round4(amount * rate)


# ============ 市值计算 ============

def calc_market_value(db: Session, portfolio_id: int) -> float:
    """计算组合市值：每个持仓 × 最新收盘价"""
    positions = (
        db.query(PortfolioPosition)
        .filter(PortfolioPosition.portfolio_id == portfolio_id,
                PortfolioPosition.qty > 0)
        .all()
    )
    if not positions:
        return 0.0

    stock_ids = [p.stock_id for p in positions]
    # 取每只股票最新 K 线（一条 SQL）
    latest_bars: Dict[int, DailyBar] = {}
    for sid in stock_ids:
        bar = (
            db.query(DailyBar)
            .filter(DailyBar.stock_id == sid)
            .order_by(DailyBar.trade_date.desc())
            .first()
        )
        if bar:
            latest_bars[sid] = bar

    mv = 0.0
    for p in positions:
        bar = latest_bars.get(p.stock_id)
        if bar and bar.volume and bar.volume > 0:
            mv += float(bar.close) * p.qty
    return _round2(mv)


def _get_last_bar(db: Session, stock_id: int) -> Optional[DailyBar]:
    return (
        db.query(DailyBar)
        .filter(DailyBar.stock_id == stock_id)
        .order_by(DailyBar.trade_date.desc())
        .first()
    )


# ============ 列表 ============

def list_portfolios(db: Session) -> Dict[str, Any]:
    """对标 PortfolioController::index"""
    rows = db.query(Portfolio).order_by(Portfolio.id.desc()).all()
    data: List[Dict[str, Any]] = []
    for p in rows:
        mv = calc_market_value(db, p.id)
        equity = _round2(p.cash + mv)
        pnl = _round2(equity - p.initial_cash)
        pnl_pct = (pnl / p.initial_cash) if p.initial_cash else None
        data.append({
            "id": p.id,
            "name": p.name,
            "user_id": p.user_id,
            "initial_cash": p.initial_cash,
            "cash": p.cash,
            "market_value": mv,
            "equity": equity,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return {"data": data, "count": len(data)}


# ============ 详情 ============

def get_portfolio_detail(db: Session, portfolio_id: int) -> Dict[str, Any]:
    """对标 PortfolioController::show"""
    pf = db.query(Portfolio).filter_by(id=portfolio_id).first()
    if not pf:
        return {"error": "组合不存在", "portfolio_id": portfolio_id}

    positions = (
        db.query(PortfolioPosition)
        .filter(PortfolioPosition.portfolio_id == portfolio_id,
                PortfolioPosition.qty > 0)
        .order_by(PortfolioPosition.id)
        .all()
    )

    # 给每个持仓附加现价、市值、浮动盈亏
    pos_data: List[Dict[str, Any]] = []
    for p in positions:
        bar = _get_last_bar(db, p.stock_id)
        cur_price = float(bar.close) if bar and bar.volume and bar.volume > 0 else None
        mv = _round2(cur_price * p.qty) if cur_price else 0.0
        float_pnl = _round2((cur_price - p.cost) * p.qty) if cur_price else None
        float_pct = ((cur_price - p.cost) / p.cost) if (cur_price and p.cost) else None
        pos_data.append({
            "id": p.id,
            "stock_id": p.stock_id,
            "code": p.code,
            "name": p.name,
            "qty": p.qty,
            "available_qty": p.available_qty,
            "cost": p.cost,
            "current_price": cur_price,
            "market_value": mv,
            "float_pnl": float_pnl,
            "float_pct": float_pct,
        })

    fills = (
        db.query(PortfolioFill)
        .filter(PortfolioFill.portfolio_id == portfolio_id)
        .order_by(PortfolioFill.id.desc())
        .limit(50)
        .all()
    )
    orders = (
        db.query(PortfolioOrder)
        .filter(PortfolioOrder.portfolio_id == portfolio_id)
        .order_by(PortfolioOrder.id.desc())
        .limit(30)
        .all()
    )

    mv = calc_market_value(db, portfolio_id)
    equity = _round2(pf.cash + mv)
    pnl = _round2(equity - pf.initial_cash)
    pnl_pct = (pnl / pf.initial_cash) if pf.initial_cash else None

    return {
        "id": pf.id,
        "name": pf.name,
        "initial_cash": pf.initial_cash,
        "cash": pf.cash,
        "market_value": mv,
        "equity": equity,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "status": pf.status,
        "created_at": pf.created_at.isoformat() if pf.created_at else None,
        "positions": pos_data,
        "fills": [_fill_to_dict(f) for f in fills],
        "orders": [_order_to_dict(o) for o in orders],
        "position_count": len(pos_data),
    }


# ============ 创建 ============

def create_portfolio(
    db: Session,
    user_id: int,
    name: str,
    initial_cash: Optional[float] = None,
) -> Dict[str, Any]:
    """对标 PortfolioController::create"""
    settings = get_trading_settings(db)
    cash = float(initial_cash) if initial_cash else float(settings["initial_cash"])
    pf = Portfolio(
        name=name or "模拟账户",
        user_id=user_id,
        initial_cash=cash,
        cash=cash,
        status=1,
    )
    db.add(pf)
    db.flush()
    log_action(db, user_id, "portfolio_create", f"name={name}, cash={cash}")
    db.commit()
    db.refresh(pf)
    return {"id": pf.id, "name": pf.name, "initial_cash": pf.initial_cash, "message": "组合已创建"}


# ============ 下单 ============

def place_order(
    db: Session,
    user_id: int,
    portfolio_id: int,
    stock_id: int,
    side: str,
    qty: int,
) -> Dict[str, Any]:
    """对标 PortfolioController::order

    流程：
      1. 校验组合 / 股票 / 数量
      2. 买入须 100 整数倍
      3. 涨跌停检查
      4. 资金 / 可卖检查
      5. 更新 portfolio_positions + portfolios.cash
      6. 写 portfolio_orders + portfolio_fills
      7. 写 portfolio_equity（按交易日去重）
      8. 写审计日志
    """
    pf = db.query(Portfolio).filter_by(id=portfolio_id).first()
    if not pf:
        return {"error": "组合不存在"}

    stock = db.query(Stock).filter_by(id=stock_id).first()
    if not stock:
        return {"error": "股票不存在"}

    if side not in ("buy", "sell"):
        return {"error": "side 必须是 buy 或 sell"}
    if qty <= 0:
        return {"error": "数量必须 > 0"}

    settings = get_trading_settings(db)
    lot = int(settings["lot_size"])

    if side == "buy" and qty % lot != 0:
        return {"error": f"买入数量须为 {lot} 的整数倍"}

    bar = _get_last_bar(db, stock_id)
    if not bar or not bar.volume or bar.volume <= 0:
        return {"error": "无行情或停牌"}

    raw_price = float(bar.close)
    price = apply_slippage(raw_price, float(settings["slippage_bps"]), side)
    amount = _round2(price * qty)
    commission = calc_commission(amount, float(settings["commission_rate"]),
                                  float(settings["min_commission"]))
    stamp = calc_stamp_tax(amount, float(settings["stamp_tax_rate"])) if side == "sell" else 0.0
    fee = _round2(commission + stamp)
    trade_date = bar.trade_date

    # 涨跌停检查
    pre = float(bar.pre_close) if bar.pre_close else float(bar.open)
    code = stock.code or ""
    is_gem = code.startswith(("300", "301", "688"))
    lim = float(settings["board_limit_gem"]) if is_gem else float(settings["board_limit_main"])
    up = _round2(pre * (1 + lim))
    down = _round2(pre * (1 - lim))
    px = _round2(price)

    if side == "buy" and px >= up - 1e-6 and float(bar.close) >= up - 1e-6:
        db.add(PortfolioOrder(
            portfolio_id=portfolio_id, stock_id=stock_id, code=stock.code,
            side=side, order_price=price, qty=qty,
            status="rejected", message="涨停无法买入",
        ))
        db.commit()
        return {"error": "涨停无法买入（模拟规则）"}

    if side == "sell" and px <= down + 1e-6 and float(bar.close) <= down + 1e-6:
        db.add(PortfolioOrder(
            portfolio_id=portfolio_id, stock_id=stock_id, code=stock.code,
            side=side, order_price=price, qty=qty,
            status="rejected", message="跌停无法卖出",
        ))
        db.commit()
        return {"error": "跌停无法卖出（模拟规则）"}

    # 事务处理
    try:
        if side == "buy":
            total = _round2(amount + fee)
            if pf.cash < total:
                return {"error": "资金不足"}
            pf.cash = _round2(pf.cash - total)

            pos = (
                db.query(PortfolioPosition)
                .filter_by(portfolio_id=portfolio_id, stock_id=stock_id)
                .first()
            )
            if pos:
                new_qty = pos.qty + qty
                new_cost = _round4((pos.cost * pos.qty + amount) / new_qty)
                # 新买部分当日不可卖：available_qty 不变
                pos.qty = new_qty
                pos.cost = new_cost
                pos.name = stock.name
            else:
                pos = PortfolioPosition(
                    portfolio_id=portfolio_id, stock_id=stock_id,
                    code=stock.code, name=stock.name,
                    qty=qty, available_qty=0, cost=price,
                )
                db.add(pos)
        else:  # sell
            pos = (
                db.query(PortfolioPosition)
                .filter_by(portfolio_id=portfolio_id, stock_id=stock_id)
                .first()
            )
            if not pos or pos.available_qty < qty:
                return {"error": "可卖数量不足（T+1：当日买入不可卖）"}

            proceeds = _round2(amount - fee)
            pf.cash = _round2(pf.cash + proceeds)
            new_qty = pos.qty - qty
            new_avail = pos.available_qty - qty
            if new_qty <= 0:
                db.delete(pos)
            else:
                pos.qty = new_qty
                pos.available_qty = new_avail

        # 写订单（filled）
        order = PortfolioOrder(
            portfolio_id=portfolio_id, stock_id=stock_id, code=stock.code,
            side=side, order_price=price, qty=qty,
            status="filled", message="ok",
        )
        db.add(order)
        db.flush()

        # 写成交
        fill = PortfolioFill(
            portfolio_id=portfolio_id, order_id=order.id,
            stock_id=stock_id, code=stock.code, name=stock.name,
            side=side, price=price, qty=qty, amount=amount,
            commission=commission, stamp_tax=stamp, fee=fee,
            trade_date=trade_date,
        )
        db.add(fill)

        # 写权益点（按 trade_date 去重，已存在则更新）
        existing_eq = (
            db.query(PortfolioEquity)
            .filter_by(portfolio_id=portfolio_id, trade_date=trade_date)
            .first()
        )
        mv = calc_market_value(db, portfolio_id)
        eq = _round2(pf.cash + mv)
        if existing_eq:
            existing_eq.equity = eq
            existing_eq.cash = pf.cash
            existing_eq.market_value = mv
        else:
            db.add(PortfolioEquity(
                portfolio_id=portfolio_id, trade_date=trade_date,
                equity=eq, cash=pf.cash, market_value=mv,
            ))

        log_action(db, user_id, "portfolio_order",
                   f"pf={portfolio_id} {side} {stock.code} x{qty} @{price}")
        db.commit()
        return {
            "message": f"{'买入' if side == 'buy' else '卖出'}成交 {qty} 股 @{price}",
            "side": side,
            "code": stock.code,
            "name": stock.name,
            "qty": qty,
            "price": price,
            "amount": amount,
            "commission": commission,
            "stamp_tax": stamp,
            "fee": fee,
            "trade_date": trade_date.isoformat() if trade_date else None,
        }
    except Exception as e:
        db.rollback()
        return {"error": f"下单失败：{e}"}


# ============ 日终解冻 ============

def settle_t1(db: Session, user_id: int, portfolio_id: int) -> Dict[str, Any]:
    """对标 PortfolioController::settle：将持仓全部标记为可卖"""
    pf = db.query(Portfolio).filter_by(id=portfolio_id).first()
    if not pf:
        return {"error": "组合不存在"}

    rows = (
        db.query(PortfolioPosition)
        .filter(PortfolioPosition.portfolio_id == portfolio_id)
        .all()
    )
    for p in rows:
        p.available_qty = p.qty

    log_action(db, user_id, "portfolio_settle", f"pf={portfolio_id}")
    db.commit()
    return {
        "message": "已结算：持仓全部变为可卖（模拟下一交易日开盘）",
        "portfolio_id": portfolio_id,
        "position_count": len(rows),
    }


# ============ 权益曲线 ============

def get_equity_curve(
    db: Session,
    portfolio_id: int,
    days: int = 60,
) -> Dict[str, Any]:
    """最近 N 日权益曲线"""
    rows = (
        db.query(PortfolioEquity)
        .filter(PortfolioEquity.portfolio_id == portfolio_id)
        .order_by(PortfolioEquity.trade_date.desc())
        .limit(days)
        .all()
    )
    rows = list(reversed(rows))
    return {
        "portfolio_id": portfolio_id,
        "count": len(rows),
        "curve": [
            {
                "trade_date": r.trade_date.isoformat() if r.trade_date else None,
                "equity": r.equity,
                "cash": r.cash,
                "market_value": r.market_value,
            }
            for r in rows
        ],
    }


# ============ 内部工具 ============

def _fill_to_dict(f: PortfolioFill) -> Dict[str, Any]:
    return {
        "id": f.id,
        "portfolio_id": f.portfolio_id,
        "order_id": f.order_id,
        "stock_id": f.stock_id,
        "code": f.code,
        "name": f.name,
        "side": f.side,
        "price": f.price,
        "qty": f.qty,
        "amount": f.amount,
        "commission": f.commission,
        "stamp_tax": f.stamp_tax,
        "fee": f.fee,
        "trade_date": f.trade_date.isoformat() if f.trade_date else None,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


def _order_to_dict(o: PortfolioOrder) -> Dict[str, Any]:
    return {
        "id": o.id,
        "portfolio_id": o.portfolio_id,
        "stock_id": o.stock_id,
        "code": o.code,
        "side": o.side,
        "order_price": o.order_price,
        "qty": o.qty,
        "status": o.status,
        "message": o.message,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }
