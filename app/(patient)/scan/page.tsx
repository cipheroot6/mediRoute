'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'

function ScanContent() {
  const params = useSearchParams()
  const router = useRouter()
  const anchorId = params.get('a')
  const dest = params.get('dest')
  const profile = params.get('profile') ?? 'standard'
  const [status, setStatus] = useState('Locating you...')

  useEffect(() => {
    if (!anchorId) {
      setStatus('Invalid QR code.')
      return
    }

    // Check sessionStorage first — if we already fetched this anchor during
    // this hospital visit, use the cached copy.
    const cacheKey = `anchor:${anchorId}`
    const cached = sessionStorage.getItem(cacheKey)

    const resolveAnchor = cached
      ? Promise.resolve(JSON.parse(cached))
      : fetch(`/api/anchor/${anchorId}`)
          .then(r => r.json())
          .then(data => {
            if (!data.error) sessionStorage.setItem(cacheKey, JSON.stringify(data))
            return data
          })

    resolveAnchor
      .then(data => {
        if (data.error) {
          setStatus('QR code not recognised.')
          return
        }
        
        if (dest) {
          // Both anchor and destination are known, go straight to navigation
          const url = new URL('/navigate', window.location.origin)
          url.searchParams.set('hospitalId', data.hospitalId)
          url.searchParams.set('startNodeId', data.nodeId)
          if (data.node) {
            url.searchParams.set('startX', data.node.x.toString())
            url.searchParams.set('startY', data.node.y.toString())
            url.searchParams.set('startFloor', data.node.floor.toString())
          }
          url.searchParams.set('dest', dest)
          url.searchParams.set('profile', profile)
          router.replace(url.pathname + url.search)
        } else {
          // No destination provided, redirect to home to select a destination
          const homeUrl = new URL('/', window.location.origin)
          homeUrl.searchParams.set('hospitalId', data.hospitalId)
          homeUrl.searchParams.set('startNodeId', data.nodeId)
          if (data.node) {
             homeUrl.searchParams.set('startX', data.node.x.toString())
             homeUrl.searchParams.set('startY', data.node.y.toString())
             homeUrl.searchParams.set('startFloor', data.node.floor.toString())
          }
          router.replace(homeUrl.pathname + homeUrl.search)
        }
      })
      .catch(() => setStatus('No signal. Try moving closer to a window.'))
  }, [anchorId, dest, profile, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <MapPin className="text-primary w-10 h-10" />
      </div>
      <p className="text-muted-foreground text-lg font-medium">{status}</p>
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <ScanContent />
    </Suspense>
  )
}

