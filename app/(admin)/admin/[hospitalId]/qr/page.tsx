'use client'
import { useEffect, useState, use } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { Printer, ArrowLeft, Loader2, QrCode } from 'lucide-react'
import Link from 'next/link'

type QRAnchorData = {
  anchor_id: string
  node_id: string
  node_label: string
  node_floor?: number
  node_type?: string
  qr_data_url?: string
}

export default function QRSheetPage({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = use(params)
  const [anchors, setAnchors] = useState<QRAnchorData[]>([])
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('Loading navigation nodes & generating QR codes...')
  const supabase = createClient()

  useEffect(() => {
    async function loadAndSyncData() {
      // 1. Fetch all nodes for this hospital first
      const { data: nodesData } = await supabase
        .from('nodes')
        .select('id, label, floor, type')
        .eq('hospital_id', hospitalId)
        .order('floor')

      if (!nodesData || nodesData.length === 0) {
        setAnchors([])
        setLoading(false)
        return
      }

      const nodesMap = new Map(nodesData.map(n => [n.id, n]))

      // 2. Fetch existing anchors from db
      let { data: anchorsData } = await supabase
        .from('qr_anchors')
        .select('*')
        .eq('hospital_id', hospitalId)

      const existingNodeIds = new Set(anchorsData?.map(a => a.node_id) || [])
      const missingNodes = nodesData.filter(n => !existingNodeIds.has(n.id))

      // 3. Auto-sync: generate QR anchors in database for any nodes (like AI-generated nodes) that don't have one yet
      if (missingNodes.length > 0) {
        setStatusText(`Auto-generating QR anchors for ${missingNodes.length} AI-generated nodes...`)
        await Promise.all(missingNodes.map(async (node) => {
          try {
            await fetch('/api/admin/anchors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                anchorId: node.id,
                nodeId: node.id,
                hospitalId
              })
            })
          } catch (e) {
            console.error('Failed to generate anchor for node:', node.id, e)
          }
        }))

        // Refetch complete anchor set
        const refetched = await supabase
          .from('qr_anchors')
          .select('*')
          .eq('hospital_id', hospitalId)
        anchorsData = refetched?.data || []
      }

      setStatusText('Rendering QR matrix...')

      // 4. Enrich anchor items and create Base64 QR code image URLs
      const enriched = await Promise.all(
        (anchorsData || []).map(async (a) => {
          const url = `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/scan?a=${a.anchor_id}`
          const qrDataUrl = await QRCode.toDataURL(url, { width: 220, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
          const node = nodesMap.get(a.node_id)
          return {
            anchor_id: a.anchor_id,
            node_id: a.node_id,
            node_label: node?.label || 'Unknown Waypoint',
            node_floor: node?.floor,
            node_type: node?.type,
            qr_data_url: qrDataUrl
          }
        })
      )

      // Sort by floor number, then by label
      enriched.sort((a, b) => ((a.node_floor ?? 0) - (b.node_floor ?? 0)) || a.node_label.localeCompare(b.node_label))

      setAnchors(enriched)
      setLoading(false)
    }

    loadAndSyncData()
  }, [hospitalId, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="font-medium text-sm">{statusText}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* UI Chrome - Hidden when printing */}
      <div className="print:hidden h-16 border-b border-border bg-black/80 backdrop-blur-xl flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin`} className="text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-medium text-lg flex items-center gap-2">
            <QrCode className="text-indigo-400 w-5 h-5" />
            Hospital {hospitalId} <span className="text-muted-foreground mx-1">/</span> 
            <span>QR Navigation Anchors ({anchors.length})</span>
          </h1>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium flex items-center transition-colors shadow-sm"
        >
          <Printer size={16} className="mr-2" /> Print Sheet
        </button>
      </div>

      {/* Printable Sheet */}
      <div className="p-8 print:p-0">
        <div className="max-w-7xl mx-auto">
          {anchors.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-2xl print:hidden">
              <p className="text-muted-foreground text-base">No navigation nodes or QR anchors found for this hospital.</p>
              <p className="text-sm text-muted-foreground/70 mt-2">Use the Floor Plan Editor or AI Analyzer to create waypoints and rooms first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 print:grid-cols-4 print:gap-4 print:bg-white print:text-black">
              {anchors.map(a => (
                <div key={a.anchor_id} className="border border-border/80 p-4 rounded-xl flex flex-col items-center bg-zinc-900/40 backdrop-blur print:border-gray-300 print:bg-white print:rounded-lg print:break-inside-avoid shadow-sm hover:border-indigo-500/40 transition-all">
                  <div className="bg-white p-2 rounded-lg shadow-inner print:shadow-none print:p-0">
                    <img src={a.qr_data_url} alt={`QR for ${a.node_label}`} className="w-36 h-36 object-contain" />
                  </div>
                  <p className="mt-3 font-semibold text-center text-sm text-foreground print:text-black leading-tight">{a.node_label}</p>
                  <p className="text-xs font-medium text-indigo-400 print:text-gray-700 uppercase tracking-wider mt-1">
                    Floor {a.node_floor ?? '?'} · {a.node_type ?? 'waypoint'}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-1 print:text-gray-400 truncate w-full text-center select-all">{a.anchor_id}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
