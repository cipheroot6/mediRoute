'use client'
import { useEffect, useState, use } from 'react'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type QRAnchorData = {
  anchor_id: string
  node_id: string
  node_label?: string
  qr_data_url?: string
}

export default function QRSheetPage({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = use(params)
  const [anchors, setAnchors] = useState<QRAnchorData[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      // Fetch anchors
      const { data: anchorsData } = await supabase
        .from('qr_anchors')
        .select('*')
        .eq('hospital_id', hospitalId)

      if (!anchorsData) {
        setLoading(false)
        return
      }

      // Fetch nodes to get labels
      const { data: nodesData } = await supabase
        .from('nodes')
        .select('id, label')
        .eq('hospital_id', hospitalId)

      const nodesMap = new Map(nodesData?.map(n => [n.id, n.label]) || [])

      // Generate QRs
      const enriched = await Promise.all(
        anchorsData.map(async (a) => {
          const url = `${process.env.NEXT_PUBLIC_APP_URL}/scan?a=${a.anchor_id}`
          const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 2 })
          return {
            anchor_id: a.anchor_id,
            node_id: a.node_id,
            node_label: nodesMap.get(a.node_id) || 'Unknown Node',
            qr_data_url: qrDataUrl
          }
        })
      )

      setAnchors(enriched)
      setLoading(false)
    }

    loadData()
  }, [hospitalId])

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p>Generating QR codes...</p></div>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* UI Chrome - Hidden when printing */}
      <div className="print:hidden h-16 border-b border-border bg-black/80 backdrop-blur-xl flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin`} className="text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-medium text-lg">Hospital {hospitalId} <span className="text-muted-foreground mx-2">/</span> QR Anchors</h1>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium flex items-center transition-colors hover:bg-primary/90"
        >
          <Printer size={16} className="mr-2" /> Print Sheet
        </button>
      </div>

      {/* Printable Sheet */}
      <div className="p-8 print:p-0">
        <div className="max-w-6xl mx-auto">
          {anchors.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-2xl print:hidden">
              <p className="text-muted-foreground">No QR anchors found for this hospital.</p>
              <p className="text-sm text-muted-foreground mt-2">Add anchors from the floor plan editor.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 print:grid-cols-4 print:gap-4 print:bg-white print:text-black">
              {anchors.map(a => (
                <div key={a.anchor_id} className="border border-border p-4 rounded-xl flex flex-col items-center bg-black/20 print:border-gray-300 print:bg-white print:break-inside-avoid">
                  <img src={a.qr_data_url} alt={`QR for ${a.node_label}`} className="w-32 h-32 object-contain" />
                  <p className="mt-3 font-semibold text-center text-sm print:text-black">{a.node_label}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1 print:text-gray-500">{a.anchor_id}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
