"use client"

import { useState, useEffect, useCallback } from 'react'
import { Heart, Bluetooth, X } from 'lucide-react'
import apiService from '../../lib/api-service'

let __hrw_streamStarted = false
let __hrw_subscribers = 0

interface Device {
  id: string
  name: string
  address: string
  rssi: number
  first_seen: string
}

interface HeartRateData {
  device_id: string
  device_name: string
  heart_rate: number
  rssi: number
  timestamp: string
  stats: {
    min: number
    max: number
    avg: number
    count: number
  }
}

interface HeartRateWidgetProps {
  className?: string
  onHeartRateUpdate?: (heartRate: number) => void
  readOnlyBpm?: number | null         
}

export default function HeartRateWidget({ 
    className = '', 
    onHeartRateUpdate,
    readOnlyBpm,                   // 👈 新增解構，僅做顯示覆寫用 
  }: HeartRateWidgetProps) {
  
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [currentHeartRate, setCurrentHeartRate] = useState<number | null>(null)
  const [, setIsConnected] = useState(false)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDevices = async () => {
    try {
      setError(null)
      const allDevices = await apiService.getDevices()

      // 篩選 Mi Band 設備：檢查設備名稱和地址
      const miBandDevices = allDevices.filter((device: Device) => {
        const name = device.name.toLowerCase()
        const address = device.address || ''

        // 檢查名稱關鍵字
        const hasValidName = name.includes('mi band') ||
                             name.includes('xiaomi') ||
                             name.includes('smart band') ||
                             (name.includes('mi') && name.includes('band')) ||
                             name.includes('mi_scale')

        // 也接受 "Unknown" 名稱的設備，如果它們來自已知的 Mi Band 地址模式
        const isUnknownButPotentialMiBand = name === 'unknown' && address.length > 10

        return hasValidName || isUnknownButPotentialMiBand
      })

      setDevices(miBandDevices)
      console.log('Filtered Mi Band devices:', miBandDevices)
    } catch (error) {
      console.error('Error loading devices:', error)
      setError('Failed to load devices')
    }
  }

  const handleConnected = useCallback(() => {
    setIsConnected(true)
    setError(null)
  }, [setIsConnected, setError])

  const handleDisconnected = useCallback(() => {
    setIsConnected(false)
  }, [setIsConnected])

  const handleHeartRateData = useCallback((data: HeartRateData) => {
    console.log('🔍 Raw heart rate data:', data)
    console.log('📊 Stats - Min:', data.stats?.min, 'Max:', data.stats?.max, 'Count:', data.stats?.count)

    if (!selectedDevice || data.device_id === selectedDevice) {
      // 驗證心率數據範圍 (40-200 BPM)
      if (data.heart_rate >= 40 && data.heart_rate <= 200) {
        setCurrentHeartRate(data.heart_rate)
        console.log(`✅ Updated heart rate: ${data.heart_rate} BPM for device ${data.device_id}`)

        // ★ 通知父組件心率更新 (用於卡路里計算)
        if (onHeartRateUpdate) {
          onHeartRateUpdate(data.heart_rate)
        }

        // 檢查數據是否異常固定
        if (data.stats && data.stats.min === data.stats.max && data.stats.count > 10) {
          console.warn(`⚠️ 數據異常：心率值固定在 ${data.heart_rate} BPM，已有 ${data.stats.count} 個相同讀數`)
        }
      } else {
        console.warn(`❌ Invalid heart rate received: ${data.heart_rate} BPM, ignoring`)
      }
    }
  }, [selectedDevice, onHeartRateUpdate])

  const handleError = useCallback((errorData: { message: string }) => {
    setError(errorData.message || 'Connection error')
  }, [setError])

  // Load devices and setup event listeners
  useEffect(() => {
    
    loadDevices()

    // refcount：第一個訂閱者出現時啟動串流
    __hrw_subscribers += 1
    if (!__hrw_streamStarted) {
      apiService.startHeartRateStream()
      __hrw_streamStarted = true
    }

    // 每個實例各自掛事件監聽
    apiService.on('connected', handleConnected)
    apiService.on('disconnected', handleDisconnected)
    apiService.on('heartRate', handleHeartRateData)
    apiService.on('error', handleError)

    // Cleanup on unmount
    return () => {
      apiService.off('connected', handleConnected)
      apiService.off('disconnected', handleDisconnected)
      apiService.off('heartRate', handleHeartRateData)
      apiService.off('error', handleError)

      // 只有最後一個訂閱者卸載時，才真正斷線
      __hrw_subscribers -= 1
      if (__hrw_subscribers <= 0) {
        __hrw_subscribers = 0
        __hrw_streamStarted = false
        apiService.disconnect()
      }
    }
  }, [handleConnected, handleDisconnected, handleHeartRateData, handleError])

  // Periodically refresh devices list when selector is open
  useEffect(() => {
    if (!showDeviceSelector) return

    const interval = setInterval(loadDevices, 3000)
    return () => clearInterval(interval)
  }, [showDeviceSelector])

  const handleDeviceSelect = async (deviceId: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // 只有在選擇不同設備時才清除心率數據
      if (selectedDevice !== deviceId) {
        setCurrentHeartRate(null)
        console.log('Clearing heart rate data for device switch...')
      } else {
        console.log('Re-selecting same device, keeping current heart rate data...')
      }

      await apiService.selectDevice(deviceId)
      setSelectedDevice(deviceId)
      setShowDeviceSelector(false)

      console.log(`Selected device: ${deviceId}`)
    } catch (error) {
      console.error('Error selecting device:', error)
      setError('Failed to select device')
    } finally {
      setIsLoading(false)
    }
  }

  const handleWidgetClick = () => {
    setShowDeviceSelector(true)
    loadDevices() // Refresh devices when opening selector
  }

  const shownBpm = readOnlyBpm ?? currentHeartRate
  const hasBpm   = shownBpm !== null && shownBpm !== undefined
  const getDisplayValue = () => (hasBpm ? String(shownBpm) : "N/A")
  const getCircleColor  = () =>
    hasBpm ? "bg-gradient-to-br from-green-400 to-green-600"
          : "bg-gradient-to-br from-red-400 to-red-600"

  return (
    <>
      {/* Heart Rate Widget */}
      <div
        className={`flex items-center gap-3 bg-white/90 rounded-[2rem] px-8 py-4 shadow-md cursor-pointer hover:bg-white/95 transition-colors duration-200 ${className}`}
        onClick={handleWidgetClick}
      >
        <span className={`h-9 w-9 rounded-full ${getCircleColor()} shadow-inner`} />
        <div className="leading-tight">
          <div className="text-2xl font-extrabold text-gray-800">{getDisplayValue()}</div>
          <div className="text-sm text-gray-500">心率</div>
        </div>
      </div>

      {/* Device Selection Modal */}
      {showDeviceSelector && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="device-selector-title"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="px-8 py-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 id="device-selector-title" className="text-2xl font-bold text-gray-900">
                  選擇 Mi Band 設備
                </h2>
                <button
                  onClick={() => setShowDeviceSelector(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
                  ⚠️ {error}
                </div>
              )}

              {/* Debug Info */}
              <div className="mb-4 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                偵測到設備總數: {devices.length} |
                {selectedDevice ? ` 已選擇: ${selectedDevice}` : ' 未選擇設備'} |
                心率: {currentHeartRate || 'N/A'}
              </div>

              {/* Device List */}
              {devices.length === 0 ? (
                <div className="text-center py-12">
                  <Bluetooth className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">
                    未偵測到 Mi Band 設備
                  </p>
                  <p className="text-sm text-gray-400">
                    請確保您的 Mi Band 在附近並正在廣播心率數據
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-64 overflow-y-auto">
                  {devices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleDeviceSelect(device.id)}
                      disabled={isLoading}
                      className={`p-4 rounded-lg border-2 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                        selectedDevice === device.id
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-800">{device.name}</h3>
                            {selectedDevice === device.id && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                                已連接
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {device.address}
                          </p>
                          <p className="text-xs text-gray-400">
                            RSSI: {device.rssi}dBm | 發現時間: {new Date(device.first_seen).toLocaleTimeString()}
                          </p>
                        </div>
                        <Heart className={`w-5 h-5 ${selectedDevice === device.id ? 'text-green-500' : 'text-red-500'}`} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="mt-6 flex justify-between items-center">
                <button
                  onClick={loadDevices}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {isLoading ? '掃描中...' : '重新掃描'}
                </button>
                <button
                  onClick={() => setShowDeviceSelector(false)}
                  className="px-6 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}