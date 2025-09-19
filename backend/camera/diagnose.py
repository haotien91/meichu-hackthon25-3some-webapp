#!/usr/bin/env python3
"""
imx93 攝影機診斷工具
檢查攝影機設備、GStreamer 管道和 WebSocket 服務
"""

import os
import subprocess
import time
import json
import glob
from pathlib import Path

def check_camera_device():
    """檢查攝影機設備"""
    print("🎥 檢查攝影機設備...")

    devices = glob.glob("/dev/video*")
    if not devices:
        print("❌ 沒有找到 /dev/video* 設備")
        return False

    for device in devices:
        print(f"✅ 找到設備: {device}")
        try:
            # 檢查設備權限
            stat = os.stat(device)
            print(f"   權限: {oct(stat.st_mode)[-3:]}")
        except Exception as e:
            print(f"   ❌ 無法訪問: {e}")

    return True

def test_gstreamer():
    """測試 GStreamer 管道"""
    print("\n🔧 測試 GStreamer...")

    # 簡單測試命令
    test_cmd = [
        "gst-launch-1.0",
        "v4l2src", "device=/dev/video0", "num-buffers=5",
        "!", "videoconvert",
        "!", "jpegenc", "quality=50",
        "!", "multifilesink", "location=/tmp/test-%d.jpg"
    ]

    try:
        print(f"執行: {' '.join(test_cmd)}")
        result = subprocess.run(test_cmd, capture_output=True, text=True, timeout=10)

        if result.returncode == 0:
            print("✅ GStreamer 測試成功")

            # 檢查生成的圖片
            test_files = glob.glob("/tmp/test-*.jpg")
            if test_files:
                print(f"✅ 生成了 {len(test_files)} 個測試圖片")
                for f in test_files:
                    size = os.path.getsize(f)
                    print(f"   {f}: {size} bytes")
                    os.remove(f)  # 清理
            return True
        else:
            print("❌ GStreamer 測試失敗")
            print(f"錯誤: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("⏰ GStreamer 測試超時")
        return False
    except Exception as e:
        print(f"❌ GStreamer 測試異常: {e}")
        return False

def check_network():
    """檢查網路配置"""
    print("\n🌐 檢查網路配置...")

    try:
        # 獲取 IP 地址
        result = subprocess.run(['hostname', '-I'], capture_output=True, text=True)
        ips = result.stdout.strip().split()
        print(f"✅ 本機 IP 地址: {ips}")

        # 檢查端口占用
        ports_to_check = [5000, 5001, 8000]
        for port in ports_to_check:
            result = subprocess.run(['ss', '-tuln'], capture_output=True, text=True)
            if f":{port}" in result.stdout:
                print(f"✅ 端口 {port} 正在使用")
            else:
                print(f"⚠️ 端口 {port} 未使用")

    except Exception as e:
        print(f"❌ 網路檢查失敗: {e}")

def check_websockets():
    """檢查 WebSocket 依賴"""
    print("\n📦 檢查 WebSocket 依賴...")

    try:
        import websockets
        print(f"✅ websockets 版本: {websockets.__version__}")
        return True
    except ImportError:
        print("❌ websockets 未安裝")
        print("請執行: pip install websockets==12.0")
        return False

def test_camera_endpoints():
    """測試攝影機 API 端點"""
    print("\n🔗 測試攝影機 API...")

    import requests

    endpoints = [
        "http://localhost:5000/health",
        "http://localhost:5000/ws_info"
    ]

    for url in endpoints:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print(f"✅ {url}: {response.status_code}")
                data = response.json()
                print(f"   響應: {json.dumps(data, indent=2, ensure_ascii=False)}")
            else:
                print(f"❌ {url}: {response.status_code}")
        except Exception as e:
            print(f"❌ {url}: {e}")

def main():
    """主診斷函數"""
    print("🔍 imx93 攝影機系統診斷")
    print("=" * 50)

    # 檢查順序
    checks = [
        ("攝影機設備", check_camera_device),
        ("GStreamer", test_gstreamer),
        ("網路配置", check_network),
        ("WebSocket 依賴", check_websockets),
    ]

    results = {}
    for name, check_func in checks:
        try:
            results[name] = check_func()
        except Exception as e:
            print(f"❌ {name} 檢查失敗: {e}")
            results[name] = False

    # 摘要
    print("\n" + "=" * 50)
    print("📋 診斷摘要:")
    for name, result in results.items():
        status = "✅ 正常" if result else "❌ 異常"
        print(f"   {name}: {status}")

    # 建議
    print("\n💡 建議:")
    if not results.get("攝影機設備", False):
        print("   1. 檢查攝影機是否正確連接")
        print("   2. 確認 /dev/video0 設備存在")

    if not results.get("GStreamer", False):
        print("   1. 檢查 GStreamer 安裝: gst-launch-1.0 --version")
        print("   2. 檢查攝影機權限: sudo chmod 666 /dev/video0")

    if not results.get("WebSocket 依賴", False):
        print("   1. 安裝 WebSocket: pip install websockets==12.0")

    print("\n🚀 完成診斷")

if __name__ == "__main__":
    main()