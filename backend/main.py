import os
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import websockets

# ============ Models ============
class OrderRequest(BaseModel):
    user_id: str
    symbol: str
    side: str  # BUY / SELL
    type: str  # MARKET / LIMIT
    price: Optional[float] = None
    quantity: float

class OrderResponse(BaseModel):
    id: str
    symbol: str
    side: str
    type: str
    price: float
    quantity: float
    filled_quantity: float
    avg_fill_price: float
    status: str
    fee: float
    slippage: float

# ============ In-Memory State ============
# For production, replace with Redis + Supabase
orderbooks: dict = {}  # symbol -> { bids: [...], asks: [...] }
tickers: dict = {}     # symbol -> ticker data
user_portfolios: dict = {}  # user_id -> { asset: { balance, avg_price } }
user_orders: dict = {}  # user_id -> [orders]
ws_clients: set = set()

# Default seed money
SEED_MONEY_USD = 70000.0
FEE_RATE = 0.001  # 0.1%

def get_portfolio(user_id: str) -> dict:
    if user_id not in user_portfolios:
        user_portfolios[user_id] = {
            "USDT": {"balance": SEED_MONEY_USD, "avg_price": 1.0}
        }
    return user_portfolios[user_id]

def get_orders(user_id: str) -> list:
    if user_id not in user_orders:
        user_orders[user_id] = []
    return user_orders[user_id]


# ============ Binance Feed ============
async def binance_feed_task():
    """Connect to Binance WebSocket and maintain local orderbook/ticker."""
    symbols = ["btcusdt", "ethusdt", "bnbusdt", "solusdt", "xrpusdt", "dogeusdt"]
    streams = []
    for s in symbols:
        streams.extend([f"{s}@ticker", f"{s}@depth20@100ms"])
    
    url = f"wss://stream.binance.com:9443/stream?streams={'/'.join(streams)}"
    
    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"[Binance] Connected to {len(symbols)} streams")
                async for msg in ws:
                    data = json.loads(msg)
                    stream = data.get("stream", "")
                    payload = data.get("data", {})
                    
                    if "@ticker" in stream:
                        symbol = payload["s"]
                        tickers[symbol] = {
                            "symbol": symbol,
                            "price": float(payload["c"]),
                            "priceChange": float(payload["p"]),
                            "priceChangePercent": float(payload["P"]),
                            "high24h": float(payload["h"]),
                            "low24h": float(payload["l"]),
                            "volume24h": float(payload["v"]),
                            "quoteVolume24h": float(payload["q"]),
                        }
                    elif "@depth" in stream:
                        symbol = stream.split("@")[0].upper()
                        orderbooks[symbol] = {
                            "bids": [{"price": float(b[0]), "quantity": float(b[1])} for b in payload["bids"]],
                            "asks": [{"price": float(a[0]), "quantity": float(a[1])} for a in payload["asks"]],
                        }
                    
                    # Broadcast to connected clients
                    dead = set()
                    for client in ws_clients:
                        try:
                            await client.send_json({"stream": stream, "data": payload})
                        except Exception:
                            dead.add(client)
                    ws_clients -= dead
                    
        except Exception as e:
            print(f"[Binance] Connection error: {e}, reconnecting in 3s...")
            await asyncio.sleep(3)


# ============ Matching Engine ============
def execute_market_order(user_id: str, symbol: str, side: str, quantity: float) -> OrderResponse:
    portfolio = get_portfolio(user_id)
    base_asset = symbol.replace("USDT", "")
    quote_asset = "USDT"
    
    ob = orderbooks.get(symbol)
    if not ob:
        raise HTTPException(status_code=400, detail="Order book not available")
    
    levels = ob["asks"] if side == "BUY" else ob["bids"]
    if not levels:
        raise HTTPException(status_code=400, detail="No liquidity")
    
    remaining = quantity
    total_cost = 0.0
    fills = []
    
    for level in levels:
        if remaining <= 0:
            break
        fill_qty = min(remaining, level["quantity"])
        total_cost += level["price"] * fill_qty
        remaining -= fill_qty
        fills.append({"price": level["price"], "qty": fill_qty})
    
    filled_qty = quantity - remaining
    if filled_qty <= 0:
        raise HTTPException(status_code=400, detail="Insufficient liquidity")
    
    avg_price = total_cost / filled_qty
    fee = total_cost * FEE_RATE
    slippage = abs(avg_price - levels[0]["price"]) / levels[0]["price"] * 100
    
    # Update portfolio
    if side == "BUY":
        quote_balance = portfolio.get(quote_asset, {}).get("balance", 0)
        if total_cost + fee > quote_balance:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        portfolio[quote_asset]["balance"] -= (total_cost + fee)
        
        if base_asset in portfolio:
            old_bal = portfolio[base_asset]["balance"]
            old_avg = portfolio[base_asset]["avg_price"]
            new_bal = old_bal + filled_qty
            new_avg = (old_bal * old_avg + total_cost) / new_bal if new_bal > 0 else avg_price
            portfolio[base_asset] = {"balance": new_bal, "avg_price": new_avg}
        else:
            portfolio[base_asset] = {"balance": filled_qty, "avg_price": avg_price}
    else:
        base_balance = portfolio.get(base_asset, {}).get("balance", 0)
        if filled_qty > base_balance:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        portfolio[base_asset]["balance"] -= filled_qty
        if portfolio[base_asset]["balance"] < 0.00000001:
            del portfolio[base_asset]
        
        if quote_asset in portfolio:
            portfolio[quote_asset]["balance"] += (total_cost - fee)
        else:
            portfolio[quote_asset] = {"balance": total_cost - fee, "avg_price": 1.0}
    
    # Create order record
    import time
    order_id = f"{int(time.time()*1000)}-{len(get_orders(user_id))}"
    order = OrderResponse(
        id=order_id,
        symbol=symbol,
        side=side,
        type="MARKET",
        price=avg_price,
        quantity=filled_qty,
        filled_quantity=filled_qty,
        avg_fill_price=avg_price,
        status="FILLED",
        fee=fee,
        slippage=slippage,
    )
    get_orders(user_id).insert(0, order.model_dump())
    
    return order


# ============ Lifespan ============
@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(binance_feed_task())
    yield
    task.cancel()

# ============ App ============
app = FastAPI(title="VirtuTrade API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ REST Endpoints ============
@app.get("/api/health")
async def health():
    return {"status": "ok", "symbols": list(tickers.keys())}

@app.post("/api/order", response_model=OrderResponse)
async def create_order(req: OrderRequest):
    if req.type == "MARKET":
        return execute_market_order(req.user_id, req.symbol, req.side, req.quantity)
    else:
        # Limit order — just record it (simplified)
        import time
        order_id = f"{int(time.time()*1000)}-{len(get_orders(req.user_id))}"
        order = OrderResponse(
            id=order_id,
            symbol=req.symbol,
            side=req.side,
            type="LIMIT",
            price=req.price or 0,
            quantity=req.quantity,
            filled_quantity=0,
            avg_fill_price=0,
            status="OPEN",
            fee=0,
            slippage=0,
        )
        get_orders(req.user_id).insert(0, order.model_dump())
        return order

@app.get("/api/portfolio/{user_id}")
async def get_user_portfolio(user_id: str):
    portfolio = get_portfolio(user_id)
    return {"portfolio": [
        {"asset": asset, "balance": data["balance"], "avg_price": data["avg_price"]}
        for asset, data in portfolio.items()
        if data["balance"] > 0.00000001
    ]}

@app.get("/api/orders/{user_id}")
async def get_user_orders(user_id: str):
    return {"orders": get_orders(user_id)[:100]}

@app.delete("/api/order/{user_id}/{order_id}")
async def cancel_order(user_id: str, order_id: str):
    orders = get_orders(user_id)
    for o in orders:
        if o["id"] == order_id and o["status"] == "OPEN":
            o["status"] = "CANCELLED"
            return {"status": "cancelled"}
    raise HTTPException(status_code=404, detail="Order not found")

@app.get("/api/ticker/{symbol}")
async def get_ticker(symbol: str):
    ticker = tickers.get(symbol.upper())
    if not ticker:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return ticker

@app.get("/api/orderbook/{symbol}")
async def get_orderbook(symbol: str):
    ob = orderbooks.get(symbol.upper())
    if not ob:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return ob


# ============ WebSocket ============
@app.websocket("/ws/market")
async def ws_market(websocket: WebSocket):
    await websocket.accept()
    ws_clients.add(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
