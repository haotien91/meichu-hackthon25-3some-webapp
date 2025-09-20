import os, time, glob, subprocess, threading, json, base64, asyncio, socket
from typing import Optional, Tuple
from flask import Flask, Response, request, send_file, abort, jsonify
from flask_cors import CORS

# WebSocket 支援
try:
    import websockets
    WEBSOCKET_AVAILABLE = True
except ImportError:
    print("⚠️ websockets not available, WebSocket features disabled")
    WEBSOCKET_AVAILABLE = False

DEVICE = os.environ.get("CAM_DEV", "/dev/video0")
DEF_W, DEF_H, DEF_FPS, DEF_FMT = 640, 480, 60, "NV12"
ALLOWED_FMT = {"NV12", "YUYV"}

RAM_DIR = "/dev/shm/cam"
FALLBACK_DIR = "/data/cam-test/.frames"
GST_LOG = "/data/cam-test/gst.log"

SNAP_DIR = "/data/cam-test/snaps"
os.makedirs(SNAP_DIR, exist_ok=True)

def frames_dir() -> str:
    d = RAM_DIR if os.path.isdir("/dev/shm") else FALLBACK_DIR
    os.makedirs(d, exist_ok=True)
    return d

app = Flask(__name__)
CORS(app)

_bg_lock = threading.Lock()
_bg_proc: Optional[subprocess.Popen] = None
_cur = {}  # 當前參數

# WebSocket 串流支援
latest_frame_data: Optional[str] = None  # Base64 編碼的最新幀
latest_frame_lock = threading.Lock()
frame_update_thread: Optional[threading.Thread] = None
websocket_server_thread: Optional[threading.Thread] = None

def get_local_ip():
    """獲取本地 IP 地址"""
    try:
        # 連接到外部地址來獲取本地 IP (不會實際發送數據)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "192.168.0.174"  # 默認回退

def _cleanup_old_frames():
    for f in glob.glob(os.path.join(frames_dir(), "frame-*.jpg")):
        try: os.unlink(f)
        except: pass

def _gst_cmd(w:int,h:int,fps:int,fmt:str) -> str:
    d = frames_dir()
    # ⚡ 低延遲優化：減少緩衝、快速編碼、最小檔案數
    return (
        "gst-launch-1.0 -q "
        f"v4l2src device={DEVICE} io-mode=mmap do-timestamp=true ! "
        f'"video/x-raw,format={fmt},width={w},height={h},framerate={fps}/1" ! '
        # 🎯 關鍵優化：減少延遲
        "videorate drop-only=true ! "  # 丟幀而非等待
        "videoconvert ! "
        "queue max-size-buffers=1 leaky=downstream ! "  # 最小緩衝，防止累積延遲
        # 🚀 快速編碼設定
        "jpegenc quality=30 speed-preset=ultrafast ! "  # 60fps 優化
        # 📁 減少檔案輪替開銷
        f"multifilesink location={d}/frame-%04d.jpg max-files=3"  # 60fps 最小檔案數
    )

def _start_pipeline(w:int, h:int, fps:int, fmt:str) -> None:
    global _bg_proc, _cur
    _cleanup_old_frames()
    cmd = _gst_cmd(w,h,fps,fmt)
    log = open(GST_LOG, "ab")
    _bg_proc = subprocess.Popen(
        cmd, shell=True,
        stdout=subprocess.DEVNULL, stderr=log
    )
    _cur = dict(w=w, h=h, fps=fps, fmt=fmt)

def ensure_pipeline(w:int, h:int, fps:int, fmt:str):
    """確保擷取管線存在；參數不符則重啟。"""
    global _bg_proc, _cur
    fmt = (fmt or DEF_FMT).upper()
    if fmt not in ALLOWED_FMT: fmt = DEF_FMT

    with _bg_lock:
        want = dict(w=w, h=h, fps=fps, fmt=fmt)
        if _bg_proc and _bg_proc.poll() is None and want == _cur:
            return
        if _bg_proc and _bg_proc.poll() is None:
            try:
                _bg_proc.terminate()
                try: _bg_proc.wait(timeout=1.5)
                except: _bg_proc.kill()
            except: pass
        _start_pipeline(w,h,fps,fmt)

def latest_frame_path(retry_times:int=50, retry_sleep:float=0.01) -> Optional[str]:
    """找目前最新一張（允許重試，避免剛好被輪替）。"""
    patt = os.path.join(frames_dir(), "frame-*.jpg")
    for _ in range(retry_times):
        files = glob.glob(patt)
        if files:
            try:
                return max(files, key=os.path.getmtime)
            except FileNotFoundError:
                pass
        time.sleep(retry_sleep)
    return None

def read_latest_jpeg(timeout:float=0.1) -> Optional[Tuple[str, bytes]]:
    """
    讀到『穩定』的一張 JPEG：
      - 檔案存在
      - 大小在兩次讀之間不變
      - 大小大於 800 bytes（避免半寫）
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        p = latest_frame_path(retry_times=5, retry_sleep=0.005)
        if not p:
            time.sleep(0.01); continue
        try:
            size1 = os.path.getsize(p)
            time.sleep(0.006)
            size2 = os.path.getsize(p)
            if size2 < 800:
                time.sleep(0.01); continue
            if size2 != size1:
                time.sleep(0.01); continue
            with open(p, "rb") as f:
                data = f.read()
            if len(data) >= 800:
                return p, data
        except FileNotFoundError:
            # 被 multifilesink 輪掉了；重試
            pass
    return None

# ⚡ WebSocket 串流功能
def update_latest_frame():
    """背景執行緒：持續更新最新幀資料 (Base64)"""
    global latest_frame_data
    print("🎥 Starting frame update thread...")

    # 等待攝影機管道啟動
    startup_wait = 0
    while startup_wait < 30:  # 最多等待 30 秒
        try:
            # 檢查是否有 GStreamer 程序運行
            result = os.popen("pgrep gst-launch").read().strip()
            if result:
                print("✅ GStreamer pipeline detected, starting frame updates")
                break
        except:
            pass

        time.sleep(1)
        startup_wait += 1

    if startup_wait >= 30:
        print("⚠️ No GStreamer pipeline found, frame updates will start on demand")

    while True:
        try:
            result = read_latest_jpeg(timeout=0.05)
            if result:
                _, jpeg_data = result
                # 轉換為 Base64 以便 WebSocket 傳輸
                encoded_data = base64.b64encode(jpeg_data).decode('utf-8')

                with latest_frame_lock:
                    latest_frame_data = encoded_data

            time.sleep(0.016)  # ~60fps 更新頻率

        except Exception as e:
            # 降低錯誤訊息頻率
            if startup_wait < 30:
                print(f"❌ Frame update error: {e}")
            time.sleep(0.5 if startup_wait < 30 else 0.1)

async def video_websocket_handler(websocket, _path):
    """WebSocket 視訊串流處理器"""
    client_addr = websocket.remote_address
    print(f"🔗 New WebSocket client: {client_addr}")

    # 自動啟動攝影機管道 (如果沒有運行)
    try:
        result = os.popen("pgrep gst-launch").read().strip()
        if not result:
            print("🎬 Auto-starting camera pipeline for WebSocket client")
            # 使用預設參數啟動攝影機
            ensure_pipeline(DEF_W, DEF_H, DEF_FPS, DEF_FMT)
    except Exception as e:
        print(f"⚠️ Auto-start camera failed: {e}")

    try:
        frame_count = 0
        while True:
            with latest_frame_lock:
                frame_data = latest_frame_data

            if frame_data:
                # 發送幀資料
                message = json.dumps({
                    "type": "frame",
                    "timestamp": time.time(),
                    "format": "jpeg_base64",
                    "data": frame_data
                })
                await websocket.send(message)
                frame_count += 1

                # 每 100 幀記錄一次狀態
                if frame_count % 100 == 0:
                    print(f"📊 WebSocket sent {frame_count} frames to {client_addr}")

            await asyncio.sleep(0.016)  # ~60fps

    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 WebSocket client disconnected: {client_addr}")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")

def start_websocket_server():
    """啟動 WebSocket 伺服器"""
    if not WEBSOCKET_AVAILABLE:
        print("⚠️ WebSocket not available, skipping server start")
        return

    print("🚀 Starting WebSocket server on port 5001...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        start_server = websockets.serve(video_websocket_handler, "0.0.0.0", 5001)
        loop.run_until_complete(start_server)
        print("✅ WebSocket server started on ws://0.0.0.0:5001")
        loop.run_forever()
    except Exception as e:
        print(f"❌ WebSocket server error: {e}")

def start_background_services():
    """啟動背景服務"""
    global frame_update_thread, websocket_server_thread

    # 啟動幀更新執行緒
    if frame_update_thread is None or not frame_update_thread.is_alive():
        frame_update_thread = threading.Thread(target=update_latest_frame, daemon=True)
        frame_update_thread.start()

    # 啟動 WebSocket 伺服器執行緒
    if WEBSOCKET_AVAILABLE and (websocket_server_thread is None or not websocket_server_thread.is_alive()):
        websocket_server_thread = threading.Thread(target=start_websocket_server, daemon=True)
        websocket_server_thread.start()

@app.route("/")
def root():
    return "cam_server2 alive"

@app.route("/health")
def health():
    running = bool(_bg_proc and _bg_proc.poll() is None)
    last = latest_frame_path(retry_times=5)
    try:
        last_mtime = os.path.getmtime(last) if last else 0
    except Exception:
        last_mtime = 0
    cnt = len(glob.glob(os.path.join(frames_dir(), "frame-*.jpg")))
    return jsonify({
        "running": running,
        "params": _cur,
        "frames_dir": frames_dir(),
        "frames_count": cnt,
        "last_frame": last,
        "last_mtime": last_mtime,
        "websocket_available": WEBSOCKET_AVAILABLE,
        "websocket_url": f"ws://{get_local_ip()}:5001/video" if WEBSOCKET_AVAILABLE else None
    })

@app.route("/ws_info")
def ws_info():
    """WebSocket 串流資訊"""
    if not WEBSOCKET_AVAILABLE:
        return jsonify({
            "available": False,
            "message": "WebSocket not available - install websockets: pip install websockets"
        })

    return jsonify({
        "available": True,
        "ws_url": f"ws://{get_local_ip()}:5001/video",
        "format": "json with base64 jpeg data",
        "frame_rate": "~30fps",
        "message": "Low latency WebSocket video streaming"
    })

@app.route("/video")
def video():
    w   = int(request.args.get("width",  DEF_W))
    h   = int(request.args.get("height", DEF_H))
    fps = int(request.args.get("fps",    DEF_FPS))
    fmt = (request.args.get("format", DEF_FMT) or DEF_FMT).upper()
    ensure_pipeline(w,h,fps,fmt)

    boundary = b"frame"
    def gen():
        # 等第一張出現
        for _ in range(200):
            if latest_frame_path(): break
            time.sleep(0.01)

        while True:
            got = read_latest_jpeg(timeout=0.1)
            if not got:
                # 沒讀到穩定影像，稍等重試，不要丟錯讓串流斷掉
                time.sleep(0.01)
                continue
            _, jpg = got
            yield (
                b"--" + boundary + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpg)).encode() + b"\r\n\r\n" +
                jpg + b"\r\n"
            )
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/snap")
@app.route("/snap")
def snap():
    w   = int(request.args.get("width",  DEF_W))
    h   = int(request.args.get("height", DEF_H))
    fps = int(request.args.get("fps",    DEF_FPS))
    fmt = (request.args.get("format", DEF_FMT) or DEF_FMT).upper()
    ensure_pipeline(w,h,fps,fmt)

    got = read_latest_jpeg(timeout=2.0)
    if not got:
        return abort(503, "no frames yet")
    p, data = got

    # 如果帶 save=1，就把這一張另外存到 SNAP_DIR
    save = (request.args.get("save") or "").lower() in ("1", "true", "yes", "y")
    saved_path = None
    if save:
        ts = time.strftime("%Y%m%d-%H%M%S")
        saved_path = os.path.join(SNAP_DIR, f"snap-{ts}.jpg")
        try:
            with open(saved_path, "wb") as f:
                f.write(data)
        except Exception:
            # 存檔失敗也不阻擋回傳影像
            saved_path = None

    resp = send_file(p, mimetype="image/jpeg", download_name="snapshot.jpg", as_attachment=False)
    if saved_path:
        resp.headers["X-Saved-To"] = saved_path  # 方便你在 devtools 看到存到哪
    return resp

@app.route("/stop")
def stop():
    global _bg_proc
    with _bg_lock:
        if _bg_proc and _bg_proc.poll() is None:
            try:
                _bg_proc.terminate()
                try: _bg_proc.wait(timeout=1.5)
                except: _bg_proc.kill()
            except: pass
        _bg_proc = None
    return "stopped"

if __name__ == "__main__":
    try: subprocess.run(["killall", "gst-launch-1.0"], check=False)
    except: pass
    os.makedirs(os.path.dirname(GST_LOG), exist_ok=True)

    # 🚀 啟動背景服務 (WebSocket + 幀更新)
    print("🎬 Starting enhanced camera server with WebSocket support...")
    start_background_services()

    # 啟動 Flask 應用
    app.run(host="0.0.0.0", port=5000, threaded=True)