/**
 * imx93 WebSocket + HTTP 降級視訊客戶端
 * 高效能低延遲視訊串流，自動降級機制
 */

interface VideoConfig {
  wsUrl: string          // WebSocket URL
  httpUrl: string        // HTTP 降級 URL
  retryAttempts: number  // 重試次數
  wsTimeout: number      // WebSocket 連線超時
}

interface FrameData {
  type: 'frame'
  timestamp: number
  format: 'jpeg_base64'
  data: string  // Base64 編碼的 JPEG
}

export class Imx93VideoClient {
  private ws: WebSocket | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private isConnected = false
  private retryCount = 0
  private fallbackImage: HTMLImageElement | null = null
  private fallbackInterval: number | null = null

  // 🎯 FPS 監控
  private frameCount = 0
  private lastFpsTime = Date.now()
  private currentFPS = 0
  private fpsCallback?: (fps: number) => void

  constructor(private config: VideoConfig) {}

  /**
   * 連接到 imx93 視訊串流 (優先 WebSocket)
   */
  async connect(canvas: HTMLCanvasElement): Promise<boolean> {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    if (!this.ctx) {
      console.error('❌ Canvas context not available')
      return false
    }

    console.log('🎥 Connecting to imx93 video stream...')

    // 嘗試 WebSocket 連接
    const wsSuccess = await this.tryWebSocketConnection()
    if (wsSuccess) {
      console.log('✅ WebSocket connection successful')
      return true
    }

    // WebSocket 失敗，降級到 HTTP
    console.warn('⚠️ WebSocket failed, falling back to HTTP stream')
    return this.fallbackToHttp()
  }

  /**
   * 嘗試建立 WebSocket 連接
   */
  private async tryWebSocketConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log('🔗 Attempting WebSocket connection to:', this.config.wsUrl)
        this.ws = new WebSocket(this.config.wsUrl)
        let resolved = false

        // 連接成功
        this.ws.onopen = () => {
          console.log('✅ WebSocket connected to imx93:', this.config.wsUrl)
          this.isConnected = true
          this.retryCount = 0
          if (!resolved) {
            resolved = true
            resolve(true)
          }
        }

        // 接收視訊幀
        this.ws.onmessage = (event) => {
          try {
            const frameData: FrameData = JSON.parse(event.data)
            if (frameData.type === 'frame') {
              this.renderFrame(frameData.data)
            }
          } catch (error) {
            console.error('❌ WebSocket message parse error:', error)
          }
        }

        // 連接錯誤
        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error)
          console.error('❌ WebSocket URL:', this.config.wsUrl)
          console.error('❌ Error details:', {
            url: this.config.wsUrl,
            readyState: this.ws?.readyState,
            error: error
          })
          if (!resolved) {
            resolved = true
            resolve(false)
          }
        }

        // 連接關閉
        this.ws.onclose = () => {
          console.log('🔌 WebSocket connection closed')
          this.isConnected = false
          if (!resolved) {
            resolved = true
            resolve(false)
          }
        }

        // 連接超時
        setTimeout(() => {
          if (!resolved) {
            this.ws?.close()
            resolved = true
            resolve(false)
          }
        }, this.config.wsTimeout)

      } catch (error) {
        console.error('❌ WebSocket setup error:', error)
        resolve(false)
      }
    })
  }

  /**
   * 降級到 HTTP MJPEG 串流
   */
  private fallbackToHttp(): boolean {
    try {
      if (this.fallbackInterval) {
        clearInterval(this.fallbackInterval)
      }

      this.fallbackImage = new Image()
      this.fallbackImage.crossOrigin = 'anonymous'

      // 定期更新圖片 (模擬串流)
      this.fallbackInterval = window.setInterval(() => {
        if (this.fallbackImage && this.ctx) {
          // 添加時間戳避免快取
          this.fallbackImage.src = `${this.config.httpUrl}?t=${Date.now()}`
        }
      }, 33) // ~30fps 降級 (改善 HTTP 回退)

      this.fallbackImage.onload = () => {
        if (this.ctx && this.canvas && this.fallbackImage) {
          this.ctx.drawImage(
            this.fallbackImage,
            0, 0,
            this.canvas.width,
            this.canvas.height
          )
          // 📊 HTTP 降級也計算 FPS
          this.updateFPS()
        }
      }

      this.fallbackImage.onerror = () => {
        console.error('❌ HTTP fallback image load failed')
      }

      console.log('📡 HTTP fallback stream active')
      return true

    } catch (error) {
      console.error('❌ HTTP fallback setup failed:', error)
      return false
    }
  }

  /**
   * 設定 FPS 回調函數
   */
  setFpsCallback(callback: (fps: number) => void) {
    this.fpsCallback = callback
  }

  /**
   * 計算並更新 FPS
   */
  private updateFPS() {
    this.frameCount++
    const now = Date.now()
    const elapsed = now - this.lastFpsTime

    if (elapsed >= 1000) { // 每秒計算一次
      this.currentFPS = Math.round((this.frameCount * 1000) / elapsed)
      if (this.fpsCallback) {
        this.fpsCallback(this.currentFPS)
      }
      this.frameCount = 0
      this.lastFpsTime = now
    }
  }

  /**
   * 渲染 WebSocket 接收到的幀 (60fps 優化)
   */
  private renderFrame(base64Data: string) {
    if (!this.ctx || !this.canvas) return

    const img = new Image()
    img.onload = () => {
      if (this.ctx && this.canvas) {
        // 🚀 使用 requestAnimationFrame 優化 60fps 渲染
        requestAnimationFrame(() => {
          if (this.ctx && this.canvas) {
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height)
            // 📊 更新 FPS 計數
            this.updateFPS()
          }
        })
      }
    }
    img.src = `data:image/jpeg;base64,${base64Data}`
  }

  /**
   * 斷開連接
   */
  disconnect() {
    console.log('🔌 Disconnecting video client...')

    // 關閉 WebSocket
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // 清理 HTTP 降級
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval)
      this.fallbackInterval = null
    }
    this.fallbackImage = null

    this.isConnected = false
    console.log('✅ Video client disconnected')
  }

  /**
   * 獲取連接狀態
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      type: this.ws ? 'websocket' : 'http',
      retryCount: this.retryCount
    }
  }
}

/**
 * 工廠函數：根據環境變數創建客戶端
 */
export function createImx93VideoClient(): Imx93VideoClient {
  const config: VideoConfig = {
    wsUrl: process.env.NEXT_PUBLIC_IMX93_VIDEO_WS_URL || 'ws://192.168.0.174:5001/video',
    httpUrl: process.env.NEXT_PUBLIC_IMX93_VIDEO_HTTP_URL || 'http://192.168.0.174:5000/video',
    retryAttempts: parseInt(process.env.NEXT_PUBLIC_VIDEO_RETRY_ATTEMPTS || '3'),
    wsTimeout: parseInt(process.env.NEXT_PUBLIC_VIDEO_WS_TIMEOUT || '5000')
  }

  return new Imx93VideoClient(config)
}