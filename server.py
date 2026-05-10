"""
Shercord Signaling Server
=========================
Tiny FastAPI WebSocket relay for WebRTC peer discovery.
All actual chat/voice data flows directly peer-to-peer; this server
only exchanges SDP offers/answers and ICE candidates.
"""

import os
import json
import time
import uuid
import asyncio
import logging
import threading
import urllib.request
import urllib.parse
import re
from typing import Dict, Set, Optional
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.websockets import WebSocketState

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
log = logging.getLogger("shercord")

app = FastAPI(title="SCORD Signaling Server")

# ── Global State ──────────────────────────────────────────────────────────────

rooms: Dict[str, "Room"] = {}
DATABASE_FILE = "rooms.json"

def save_db():
    try:
        data = {rid: r.to_persist_dict() for rid, r in rooms.items()}
        with open(DATABASE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log.info(f"Database saved to {DATABASE_FILE}")
    except Exception as e:
        log.error(f"Failed to save db: {e}")


_db_save_timer: Optional[threading.Timer] = None
_db_save_lock = threading.Lock()


def schedule_save_db(delay_sec: float = 1.2):
    """Birleşik disk yazımı — pin/ikon/rol gibi sık uçları yığında tek save."""
    global _db_save_timer

    def _flush():
        global _db_save_timer
        with _db_save_lock:
            save_db()
            _db_save_timer = None

    with _db_save_lock:
        if _db_save_timer:
            _db_save_timer.cancel()
        _db_save_timer = threading.Timer(delay_sec, _flush)
        _db_save_timer.daemon = True
        _db_save_timer.start()

def load_db():
    if not os.path.exists(DATABASE_FILE):
        return
    try:
        with open(DATABASE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        for rid, rdata in data.items():
            room = Room(rid, rdata["name"], rdata.get("owner_id", "unknown"))
            room.channels = rdata.get("channels", room.channels)
            room.roles = rdata.get("roles", room.roles)
            room.peer_roles = rdata.get("peer_roles", room.peer_roles)
            room.pinned_messages = rdata.get("pinned_messages", [])
            room.messages = rdata.get("messages", {})
            room.channel_backgrounds = rdata.get("channel_backgrounds", {})
            room.icon_url = rdata.get("icon_url", None)
            room.invite_code = rdata.get("invite_code", str(uuid.uuid4())[:6].upper())
            rooms[rid] = room
        log.info(f"Database loaded from {DATABASE_FILE} ({len(rooms)} rooms)")
    except Exception as e:
        log.error(f"Failed to load db: {e}")

class Room:
    def __init__(self, room_id: str, name: str, owner_id: str):
        self.room_id = room_id
        self.name = name
        self.owner_id = owner_id
        self.created_at = time.time()
        self.peers: Dict[str, WebSocket] = {}        # peer_id → ws
        self.peer_info: Dict[str, dict] = {}         # peer_id → {username, avatar_color}
        
        # Channels and Roles — IDs must match client-side constants
        self.channels = [
            {"id": "ch-genel", "name": "genel", "type": "text"},
            {"id": "ch-duyurular", "name": "duyurular", "type": "text"},
            {"id": "ch-sesli", "name": "sesli-sohbet", "type": "voice"},
            {"id": "ch-muzik", "name": "müzik", "type": "voice"},
        ]
        self.roles = {
            "admin": {"name": "Admin", "color": "#ef4444", "hoist": True},
            "member": {"name": "Üye", "color": "#94a3b8", "hoist": False}
        }
        self.peer_roles = {owner_id: "admin"}
        self.pinned_messages = []
        self.messages = {}  # channel_id -> list[dict]
        self.channel_backgrounds = {}  # channel_id -> image url
        self.icon_url = None
        self.invite_code = str(uuid.uuid4())[:6].upper()

    def to_persist_dict(self):
        """Data to be saved to disk (metadata only)."""
        return {
            "room_id": self.room_id,
            "name": self.name,
            "owner_id": self.owner_id,
            "channels": self.channels,
            "roles": self.roles,
            "peer_roles": self.peer_roles,
            "pinned_messages": self.pinned_messages,
            "messages": self.messages,
            "channel_backgrounds": self.channel_backgrounds,
            "icon_url": self.icon_url,
            "invite_code": self.invite_code,
        }

    def to_dict(self):
        """Data to be sent to frontend (includes transient state)."""
        return {
            "room_id": self.room_id,
            "name": self.name,
            "owner_id": self.owner_id,
            "peer_count": max(1, len(self.peers)),
            "channels": self.channels,
            "roles": self.roles,
            "peer_roles": self.peer_roles,
            "pinned_messages": self.pinned_messages,
            "channel_backgrounds": self.channel_backgrounds,
            "icon_url": self.icon_url,
            "invite_code": self.invite_code,
            "messages": self.messages, # Sent for history sync
            "peers": [
                {
                    "peer_id": pid, 
                    "role": self.peer_roles.get(pid, "member"),
                    **info
                }
                for pid, info in self.peer_info.items()
            ],
        }


# ── Helpers ───────────────────────────────────────────────────────────────────

async def broadcast_to_room(room: Room, message: dict, exclude: str | None = None):
    """Send a JSON message to every peer in a room except the excluded one."""
    dead: list[str] = []
    data = json.dumps(message)
    for peer_id, ws in list(room.peers.items()):
        if peer_id == exclude:
            continue
        try:
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_text(data)
            else:
                dead.append(peer_id)
        except Exception:
            dead.append(peer_id)
    for pid in dead:
        room.peers.pop(pid, None)
        room.peer_info.pop(pid, None)


async def send_to_peer(room: Room, peer_id: str, message: dict):
    ws = room.peers.get(peer_id)
    if ws and ws.client_state == WebSocketState.CONNECTED:
        await ws.send_text(json.dumps(message))

# ── REST endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/rooms")
def list_rooms():
    return [r.to_dict() for r in rooms.values()]


@app.post("/api/rooms")
def create_room(body: dict):
    """Create a new P2P room (server). Returns the room_id."""
    room_id = str(uuid.uuid4())
    name = body.get("name", "Unnamed Server")
    owner_id = body.get("owner_id", "unknown")
    rooms[room_id] = Room(room_id, name, owner_id)
    save_db()
    log.info(f"Room created: {name!r} ({room_id}) by {owner_id}")
    return {"room_id": room_id, "invite_code": rooms[room_id].invite_code}

@app.post("/api/rooms/{room_id}/pin")
def toggle_pin(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    msg = body.get("message")
    if not msg or "id" not in msg:
        return {"error": "Invalid message"}
    
    # Toggle pin
    existing = next((m for m in room.pinned_messages if m["id"] == msg["id"]), None)
    if existing:
        room.pinned_messages = [m for m in room.pinned_messages if m["id"] != msg["id"]]
    else:
        room.pinned_messages.append(msg)
    
    schedule_save_db()
    return {"pinned": room.pinned_messages}

@app.post("/api/rooms/{room_id}/messages")
async def save_history_message(room_id: str, body: dict):
    if room_id not in rooms: return {"error": "Not found"}
    room = rooms[room_id]
    msg = body.get("message")
    if not msg: return {"error": "No message"}
    
    ch_id = msg.get("channelId", "general")
    if ch_id not in room.messages:
        room.messages[ch_id] = []
    
    # Store last 10000 messages per channel
    room.messages[ch_id].append(msg)
    if len(room.messages[ch_id]) > 10000:
        room.messages[ch_id].pop(0)
    
    # Only save to disk periodically or on important changes? 
    # For now, save on every message is safer but heavier.
    # save_db() 
    return {"success": True}

@app.post("/api/rooms/{room_id}/icon")
def update_icon(room_id: str, body: dict):
    if room_id not in rooms: return {"error": "Not found"}
    room = rooms[room_id]
    room.icon_url = body.get("url")
    schedule_save_db()
    return {"success": True}


@app.post("/api/rooms/{room_id}/channel_background")
def set_channel_background(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    ch = body.get("channel_id")
    url = body.get("url")
    if not ch:
        return {"error": "channel_id required"}
    if not url:
        room.channel_backgrounds.pop(ch, None)
    else:
        room.channel_backgrounds[ch] = url
    schedule_save_db()
    return {"success": True, "channel_backgrounds": room.channel_backgrounds}


@app.post("/api/rooms/{room_id}/invite_rotate")
def rotate_invite(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    if body.get("owner_id") != room.owner_id:
        return {"error": "Unauthorized"}
    room.invite_code = str(uuid.uuid4())[:6].upper()
    schedule_save_db(0.4)
    return {"invite_code": room.invite_code}

@app.get("/api/rooms/join/{invite_code}")
def get_room_by_code(invite_code: str):
    code = invite_code.upper()
    for room in rooms.values():
        if room.invite_code == code:
            return room.to_dict()
    return {"error": "Not found"}

@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: str, owner_id: str):
    if room_id not in rooms: return {"error": "Not found"}
    room = rooms[room_id]
    if room.owner_id != owner_id:
        return {"error": "Unauthorized"}
    del rooms[room_id]
    save_db()
    return {"success": True}

@app.post("/api/rooms/{room_id}/channels")
def add_channel(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    new_ch = {
        "id": str(uuid.uuid4())[:8],
        "name": body.get("name", "new-channel"),
        "type": body.get("type", "text")
    }
    room.channels.append(new_ch)
    schedule_save_db()
    return new_ch

@app.post("/api/rooms/{room_id}/roles")
def add_role(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    role_id = body.get("name", "new-role").lower()
    room.roles[role_id] = {
        "name": body.get("name", "New Role"),
        "color": body.get("color", "#94a3b8"),
        "hoist": body.get("hoist", False)
    }
    schedule_save_db()
    return {"role_id": role_id}

@app.post("/api/rooms/{room_id}/assign_role")
def assign_role(room_id: str, body: dict):
    if room_id not in rooms:
        return {"error": "Not found"}
    room = rooms[room_id]
    peer_id = body.get("peer_id")
    role_id = body.get("role_id")
    if peer_id and role_id in room.roles:
        room.peer_roles[peer_id] = role_id
        schedule_save_db()
        return {"success": True}
    return {"error": "Invalid data"}

@app.get("/api/ytsearch")
def yt_search(q: str):
    """Fallback tiny scraper to get first YT video ID for music bot"""
    try:
        url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(q)
        # Add basic headers to prevent 403s just in case
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req, timeout=3).read().decode()
        video_ids = re.findall(r"watch\?v=(\S{11})", html)
        if (video_ids):
            return {"id": video_ids[0]}
    except Exception as e:
        log.warning(f"YT search error: {e}")
    return {"id": None}

# ── WebSocket signaling ────────────────────────────────────────────────────────

@app.websocket("/ws/{room_id}/{peer_id}")
async def signaling_ws(websocket: WebSocket, room_id: str, peer_id: str):
    await websocket.accept()

    # Reject unknown rooms
    if room_id not in rooms:
        await websocket.send_text(json.dumps({"type": "error", "message": "Room not found"}))
        await websocket.close()
        return

    room = rooms[room_id]
    username = websocket.query_params.get("username", "Anonymous")
    avatar_color = websocket.query_params.get("color", "#7289da")
    # avatar_image is NOT stored server-side (too large); clients share it P2P via identity_announce

    # Register peer
    room.peers[peer_id] = websocket
    room.peer_info[peer_id] = {"username": username, "avatar_color": avatar_color}
    log.info(f"Peer {peer_id} ({username}) joined room {room_id}")

    # Tell the new peer who else is here
    await websocket.send_text(json.dumps({
        "type": "room_state",
        "room": room.to_dict(),
        "your_id": peer_id,
    }))

    # Tell everyone else the new peer arrived
    await broadcast_to_room(room, {
        "type": "peer_joined",
        "peer_id": peer_id,
        "username": username,
        "avatar_color": avatar_color,
        # avatar_image is sent directly peer-to-peer via identity_announce DataChannel message
    }, exclude=peer_id)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type", "")

            if msg_type in ("offer", "answer", "ice_candidate"):
                # Route signaling messages to a specific peer
                target = msg.get("target")
                if target:
                    msg["from"] = peer_id
                    await send_to_peer(room, target, msg)

            elif msg_type == "broadcast":
                # Generic broadcast (e.g. nick changes)
                msg["from"] = peer_id
                await broadcast_to_room(room, msg, exclude=peer_id)

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.warning(f"Peer {peer_id} error: {e}")
    finally:
        room.peers.pop(peer_id, None)
        room.peer_info.pop(peer_id, None)
        log.info(f"Peer {peer_id} left room {room_id}")
        await broadcast_to_room(room, {"type": "peer_left", "peer_id": peer_id})
        # Clean up empty rooms after a delay
        if len(room.peers) == 0:
            asyncio.get_event_loop().call_later(30, lambda: _cleanup_room(room_id))


def _cleanup_room(room_id: str):
    room = rooms.get(room_id)
    if room and len(room.peers) == 0:
        log.info(f"Removing empty room {room_id}")
        del rooms[room_id]


# ── Static files / SPA ────────────────────────────────────────────────────────

STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.on_event("startup")
def startup_event():
    load_db()

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    print("\n" + "="*55)
    # Avoid UnicodeEncodeError on some Windows consoles (cp1252)
    print("  SCORD Signaling Server")
    print(f"  ->  http://0.0.0.0:{port}")
    print("="*55 + "\n")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
