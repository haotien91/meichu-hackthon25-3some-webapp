/**
 * React Hook for imx93 WebSocket + HTTP video streaming
 * 自動管理連接、斷線重連、狀態更新
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Imx93VideoClient, createImx93VideoClient } from '@/lib/imx93-video-client'

interface VideoStatus {
  connected: boolean
  connectionType: 'websocket' | 'http' | 'disconnected'
  retryCount: number
  error?: string
  fps?: number
}

interface UseImx93VideoReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  status: VideoStatus
  connect: () => Promise<boolean>
  disconnect: () => void
  reconnect: () => Promise<boolean>
}

export function useImx93Video(): UseImx93VideoReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const clientRef = useRef<Imx93VideoClient | null>(null)
  const [status, setStatus] = useState<VideoStatus>({
    connected: false,
    connectionType: 'disconnected',
    retryCount: 0,
    fps: 0
  })

  // 更新狀態
  const updateStatus = useCallback(() => {
    if (clientRef.current) {
      const clientStatus = clientRef.current.getConnectionStatus()
      setStatus({
        connected: clientStatus.connected,
        connectionType: clientStatus.connected ? (clientStatus.type as "websocket" | "http") : 'disconnected',
        retryCount: clientStatus.retryCount
      })
    }
  }, [])

  // 連接函數
  const connect = useCallback(async (): Promise<boolean> => {
    // 等待 Canvas 準備就緒
    let retries = 10
    while (!canvasRef.current && retries > 0) {
      console.log('⏳ Waiting for canvas to be ready...')
      await new Promise(resolve => setTimeout(resolve, 100))
      retries--
    }

    if (!canvasRef.current) {
      console.error('❌ Canvas not ready after waiting')
      setStatus(prev => ({ ...prev, error: 'Canvas not ready' }))
      return false
    }

    try {
      // 創建新客戶端 (如果不存在)
      if (!clientRef.current) {
        clientRef.current = createImx93VideoClient()

        // 🎯 設定 FPS 回調
        clientRef.current.setFpsCallback((fps: number) => {
          setStatus(prev => ({ ...prev, fps }))
        })
      }

      console.log('🎥 Connecting to imx93 video stream...')
      setStatus(prev => ({ ...prev, error: undefined }))

      const success = await clientRef.current.connect(canvasRef.current)

      if (success) {
        console.log('✅ Video stream connected')
        updateStatus()
        return true
      } else {
        console.error('❌ Video stream connection failed')
        setStatus(prev => ({
          ...prev,
          connected: false,
          connectionType: 'disconnected',
          error: 'Connection failed'
        }))
        return false
      }

    } catch (error) {
      console.error('❌ Video connection error:', error)
      setStatus(prev => ({
        ...prev,
        connected: false,
        connectionType: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      }))
      return false
    }
  }, [updateStatus])

  // 斷開連接
  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }
    setStatus({
      connected: false,
      connectionType: 'disconnected',
      retryCount: 0,
      fps: 0
    })
    console.log('🔌 Video stream disconnected')
  }, [])

  // 重新連接
  const reconnect = useCallback(async (): Promise<boolean> => {
    disconnect()
    await new Promise(resolve => setTimeout(resolve, 1000)) // 等待 1 秒
    return connect()
  }, [connect, disconnect])

  // 組件卸載時清理
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
      }
    }
  }, [])

  // 定期更新狀態
  useEffect(() => {
    if (!status.connected) return

    const interval = setInterval(updateStatus, 1000)
    return () => clearInterval(interval)
  }, [status.connected, updateStatus])

  return {
    canvasRef,
    status,
    connect,
    disconnect,
    reconnect
  }
}