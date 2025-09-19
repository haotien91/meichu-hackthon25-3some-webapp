# 🚨 視訊連接故障排除指南

## 當前問題：Canvas not ready & WebSocket 連接失敗

### 🔍 問題診斷步驟

#### 1. imx93 上執行診斷
```bash
cd /data/APPLICATION/meichu/backend/camera
python diagnose.py
```

#### 2. 檢查 WebSocket 依賴
```bash
pip show websockets
# 如果沒安裝：
pip install websockets==12.0
```

#### 3. 手動測試攝影機
```bash
# 檢查攝影機設備
ls -la /dev/video*

# 測試 GStreamer
gst-launch-1.0 v4l2src device=/dev/video0 num-buffers=5 ! videoconvert ! jpegenc ! multifilesink location=/tmp/test-%d.jpg

# 檢查生成的檔案
ls -la /tmp/test-*.jpg
```

#### 4. 測試網路連接
在 MacBook 上執行：
```bash
# 測試基本連接
curl http://192.168.0.174:5000/health
curl http://192.168.0.174:5000/ws_info

# 測試 WebSocket（瀏覽器控制台）
const ws = new WebSocket('ws://192.168.0.174:5001/video')
ws.onopen = () => console.log('✅ Connected')
ws.onerror = (e) => console.error('❌ Error:', e)
```

### 🔧 常見問題解決方案

#### 問題 1: "Canvas not ready"
**原因**: Canvas 元素在 React 渲染完成前就嘗試連接
**解決**: 已添加重試機制，會等待 Canvas 準備好

#### 問題 2: "Auto-connection to imx93 failed"
**可能原因**:
1. WebSocket 服務未啟動
2. 防火牆阻擋端口 5001
3. websockets 套件未安裝
4. 攝影機設備不可用

**解決步驟**:
```bash
# 1. 確認服務運行
ps aux | grep python

# 2. 檢查端口
ss -tuln | grep 5001

# 3. 安裝依賴
pip install websockets==12.0

# 4. 重啟服務
cd /data/APPLICATION/meichu/backend/camera
python cam_server.py
```

#### 問題 3: GStreamer 管道失敗
**檢查步驟**:
```bash
# 確認攝影機權限
sudo chmod 666 /dev/video0

# 測試 GStreamer 版本
gst-launch-1.0 --version

# 檢查 v4l2 模組
lsmod | grep v4l2
```

#### 問題 4: IP 地址不匹配
**確認配置**:
- 前端連接來源: 192.168.0.163
- 後端服務地址: 192.168.0.174
- 確認兩者在同一網段

### 🎯 預期行為

#### 正常啟動應該看到：
```
# imx93 camera 服務
🎬 Starting enhanced camera server with WebSocket support...
🎥 Starting frame update thread...
🚀 Starting WebSocket server on port 5001...
✅ WebSocket server started on ws://0.0.0.0:5001

# 當前端連接時
🔗 New WebSocket client: ('192.168.0.163', xxxxx)
🎬 Auto-starting camera pipeline for WebSocket client
✅ GStreamer pipeline detected, starting frame updates
📊 WebSocket sent 100 frames to ('192.168.0.163', xxxxx)
```

#### 前端正常連接應該看到：
```
🔗 Attempting WebSocket connection to: ws://192.168.0.174:5001/video
✅ WebSocket connected to imx93: ws://192.168.0.174:5001/video
```

### 🚀 修復後的新功能

1. **Canvas 等待機制**: 自動等待 Canvas 準備好
2. **自動攝影機啟動**: WebSocket 連接時自動啟動 GStreamer
3. **詳細錯誤日誌**: 更清楚的錯誤訊息
4. **智能重試**: GStreamer 啟動檢測
5. **診斷工具**: 完整的系統診斷腳本

### ⚡ 立即行動

1. **在 imx93 上重啟攝影機服務**:
```bash
cd /data/APPLICATION/meichu/backend/camera
pip install websockets==12.0
python cam_server.py
```

2. **重新整理瀏覽器頁面**，觀察控制台輸出

3. **如果還有問題，執行診斷**:
```bash
python diagnose.py
```

### 📞 支援資訊

如果以上步驟都無法解決問題：
1. 提供診斷腳本輸出
2. 提供完整的錯誤日誌
3. 確認網路配置和防火牆設定