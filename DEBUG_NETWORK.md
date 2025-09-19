# 網路連接診斷

## 第一步：確認基本連通性
在 MacBook 上執行：

```bash
# 測試 HTTP 連接
curl http://192.168.0.174:5000/health

# 測試 WebSocket 資訊
curl http://192.168.0.174:5000/ws_info

# 測試心率 API (已知正常)
curl http://192.168.0.174:8000/api/devices
```

## 第二步：檢查攝影機設備
在 imx93 上執行：

```bash
# 檢查攝影機設備
ls -la /dev/video*

# 手動測試 GStreamer
gst-launch-1.0 v4l2src device=/dev/video0 num-buffers=10 ! videoconvert ! jpegenc ! multifilesink location=test-%d.jpg

# 檢查是否有圖片生成
ls -la test-*.jpg
```

## 第三步：測試 WebSocket 連接
在瀏覽器控制台執行：

```javascript
// 測試 WebSocket 連接
const ws = new WebSocket('ws://192.168.0.174:5001/video')
ws.onopen = () => console.log('✅ WebSocket connected')
ws.onerror = (e) => console.error('❌ WebSocket error:', e)
ws.onmessage = (e) => console.log('📨 Received:', e.data.length, 'bytes')
```