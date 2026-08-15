'use client'
import { useState, useRef, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Maximize, Move, Upload, X, ZoomIn, ZoomOut, Trash2, Loader2 } from 'lucide-react'
import { NODE_HIT_THRESHOLD_PX } from '@/lib/constants'

const SCALE_PRESETS = [
  { label: 'Corridor 2.4m', value: 2.4 },
  { label: 'Door 0.9m', value: 0.9 },
  { label: 'Room 4m', value: 4 },
  { label: '10m ref', value: 10 },
]

type Mode = 'calibrating' | 'placing-nodes' | 'placing-edges'
type CalibrationStep = 'point-a' | 'point-b' | 'enter-distance' | 'done'

type NodeData = {
  id: string
  label: string
  type: 'junction' | 'destination' | 'elevator' | 'stairs' | 'entry'
  x: number
  y: number
  accessible: boolean
}

type EdgeData = {
  id: string
  fromNode: string
  toNode: string
  distanceM: number
  accessible: boolean
  isStairs: boolean
  isElevator: boolean
  landmark: string | null
}

export default function FloorPlanEditor({ params }: { params: Promise<{ hospitalId: string; floor: string }> }) {
  const { hospitalId, floor: floorParam } = use(params)
  const floorNumber = parseInt(floorParam, 10)
  
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null)
  const [scaleMpp, setScaleMpp] = useState<number | null>(null)
  
  const [mode, setMode] = useState<Mode>('placing-nodes')
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [edges, setEdges] = useState<EdgeData[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [uploadStatus, setUploadStatus] = useState<string>('')

  // Calibration state
  const [calibStep, setCalibStep] = useState<CalibrationStep>('point-a')
  const [calibPtA, setCalibPtA] = useState<{px: number, py: number} | null>(null)
  const [calibPtB, setCalibPtB] = useState<{px: number, py: number} | null>(null)
  const [realDistM, setRealDistM] = useState('')

  // Draft Node state
  const [draftNode, setDraftNode] = useState<{px: number, py: number, x: number, y: number} | null>(null)
  const [showNodeForm, setShowNodeForm] = useState(false)
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeType, setNodeType] = useState<NodeData['type']>('junction')
  const [nodeAccessible, setNodeAccessible] = useState(true)

  // Draft Edge state
  const [edgeStart, setEdgeStart] = useState<NodeData | null>(null)
  const [draftEdge, setDraftEdge] = useState<{from: NodeData, to: NodeData} | null>(null)
  const [showEdgeForm, setShowEdgeForm] = useState(false)
  const [edgeAccessible, setEdgeAccessible] = useState(true)
  const [edgeIsStairs, setEdgeIsStairs] = useState(false)
  const [edgeIsElevator, setEdgeIsElevator] = useState(false)
  const [edgeLandmark, setEdgeLandmark] = useState('')

  // Image natural dimensions (for AI analysis)
  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)

  // Node edit/delete
  const [editingNode, setEditingNode] = useState<NodeData | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState<NodeData['type']>('junction')
  const [editAccessible, setEditAccessible] = useState(true)



  const imgRef = useRef<HTMLImageElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      // Fetch floor data directly or via API
      const { data: floorData } = await supabase
        .from('floors')
        .select('*')
        .eq('hospital_id', hospitalId)
        .eq('floor_number', floorNumber)
        .single()
        
      if (floorData) {
        setFloorPlanUrl(floorData.floor_plan_url)
        setScaleMpp(floorData.scale_mpp || 0.05)
      } else {
        // Floor doesn't exist yet, insert via secure admin route
        await fetch('/api/admin/floors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hospitalId, floorNumber })
        })
      }

      // Fetch nodes and edges
      const [{ data: nData }, { data: eData }] = await Promise.all([
        supabase.from('nodes').select('*').eq('hospital_id', hospitalId).eq('floor', floorNumber),
        supabase.from('edges').select('*').eq('hospital_id', hospitalId)
      ])

      if (nData) {
        setNodes(nData.map(n => ({
          id: n.id,
          label: n.label,
          type: n.type,
          x: n.x,
          y: n.y,
          accessible: n.accessible
        })))
      }
      
      if (eData) {
        setEdges(eData.map(e => ({
          id: e.id,
          fromNode: e.from_node,
          toNode: e.to_node,
          distanceM: e.distance_m,
          accessible: e.accessible,
          isStairs: e.is_stairs,
          isElevator: e.is_elevator,
          landmark: e.landmark
        })))
      }
      
      setLoading(false)
    }
    loadData()
  }, [hospitalId, floorNumber, supabase])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setUploadStatus('Reading file...')

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    if (isPdf) {
      try {
        setUploadStatus('Loading multi-page PDF document...')
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const totalPages = pdf.numPages

        let currentFloorUrl: string | null = null

        for (let i = 1; i <= totalPages; i++) {
          setUploadStatus(`Converting and uploading Floor ${i} of ${totalPages}...`)
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2.0 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          canvas.width = viewport.width
          canvas.height = viewport.height

          if (context) {
            await page.render({ canvas, canvasContext: context, viewport }).promise
          }

          const blob: Blob = await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b || new Blob()), 'image/png')
          })

          const fileName = `${hospitalId}-floor-${i}-${Date.now()}.png`
          const formData = new FormData()
          formData.append('file', blob, fileName)
          formData.append('fileName', fileName)

          const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: formData })
          if (!uploadRes.ok) {
            const errData = await uploadRes.json()
            throw new Error(errData.error || `Failed to upload Floor ${i}`)
          }

          const { publicUrl } = await uploadRes.json()

          if (i === floorNumber) {
            currentFloorUrl = publicUrl
          }

          // Update or insert floor in database
          const patchRes = await fetch('/api/admin/floors', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hospitalId, floorNumber: i, floorPlanUrl: publicUrl })
          })

          if (!patchRes.ok || (await patchRes.json()).error) {
            await fetch('/api/admin/floors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hospitalId, floorNumber: i, floorPlanUrl: publicUrl })
            })
          }
        }

        if (currentFloorUrl) {
          setFloorPlanUrl(currentFloorUrl)
        } else {
          const { data } = await supabase.from('floors').select('floor_plan_url').eq('hospital_id', hospitalId).eq('floor_number', floorNumber).single()
          if (data?.floor_plan_url) setFloorPlanUrl(data.floor_plan_url)
        }

        if (!scaleMpp) setScaleMpp(0.05)
        setMode('placing-nodes')
        setUploadStatus('')
        setLoading(false)
        return
      } catch (err: unknown) {
        console.error('PDF processing error:', err)
        alert('PDF Upload failed: ' + (err instanceof Error ? err.message : String(err)))
        setUploadStatus('')
        setLoading(false)
        return
      }
    } else {
      // Normal image upload via server route (Option B RLS bypass)
      const fileExt = file.name.split('.').pop()
      const fileName = `${hospitalId}-${floorNumber}-${Date.now()}.${fileExt}`
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fileName', fileName)

      const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) {
        const errData = await uploadRes.json()
        alert('Upload failed: ' + (errData.error || uploadRes.statusText))
        setLoading(false)
        return
      }

      const { publicUrl } = await uploadRes.json()

      await fetch('/api/admin/floors', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId, floorNumber, floorPlanUrl: publicUrl })
      })

      setFloorPlanUrl(publicUrl)
      if (!scaleMpp) setScaleMpp(0.05)
      setMode('placing-nodes')
      setLoading(false)
    }
  }

  async function handleJsonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    
    setLoading(true)
    setUploadStatus('Uploading JSON data...')
    
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const res = await fetch('/api/admin/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalId,
          floor: floorNumber,
          nodes: data.nodes || [],
          edges: data.edges || []
        })
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }
      
      window.location.reload()
    } catch (err: unknown) {
      alert('JSON Upload failed: ' + (err instanceof Error ? err.message : String(err)))
      setLoading(false)
      setUploadStatus('')
    }
    
    e.target.value = ''
  }

  function handleCalibrationClick(px: number, py: number) {
    if (calibStep === 'point-a') {
      setCalibPtA({ px, py })
      setCalibStep('point-b')
    } else if (calibStep === 'point-b') {
      setCalibPtB({ px, py })
      setCalibStep('enter-distance')
    }
  }

  async function confirmCalibration() {
    if (!calibPtA || !calibPtB || !realDistM) return
    const dx = calibPtB.px - calibPtA.px
    const dy = calibPtB.py - calibPtA.py
    const newScaleMpp = parseFloat(realDistM) / Math.sqrt(dx * dx + dy * dy)
    await fetch('/api/admin/floors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, floorNumber, scaleMpp: newScaleMpp })
    })

    // Automatically apply calibration scale to all other floors in this hospital so multi-floor AI can run instantly
    try {
      const allFloorsRes = await fetch('/api/admin/floors')
      if (allFloorsRes.ok) {
        const allFloors = await allFloorsRes.json()
        for (const fl of allFloors) {
          if (fl.hospital_id === hospitalId && fl.floor_number !== floorNumber && !fl.scale_mpp) {
            await fetch('/api/admin/floors', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hospitalId, floorNumber: fl.floor_number, scaleMpp: newScaleMpp })
            })
          }
        }
      }
    } catch (e) {
      console.error('Failed to auto-apply scale to other floors:', e)
    }

    setScaleMpp(newScaleMpp); setCalibStep('done'); setMode('placing-nodes')
    setCalibPtA(null); setCalibPtB(null); setRealDistM('')
  }

  function resetCalibration() {
    setCalibStep('point-a'); setCalibPtA(null); setCalibPtB(null); setRealDistM('')
  }

  function getNodeAtPixel(px: number, py: number) {
    if (!scaleMpp) return null
    for (const node of nodes) {
      const nx = node.x / scaleMpp, ny = node.y / scaleMpp
      if (Math.sqrt((nx - px) ** 2 + (ny - py) ** 2) < NODE_HIT_THRESHOLD_PX) return node
    }
    return null
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    const px = e.nativeEvent.offsetX / zoom
    const py = e.nativeEvent.offsetY / zoom
    if (mode === 'calibrating') { handleCalibrationClick(px, py); return }
    if (mode === 'placing-nodes') {
      if (!scaleMpp) return
      const existing = getNodeAtPixel(px, py)
      if (existing) {
        setEditingNode(existing); setEditLabel(existing.label)
        setEditType(existing.type); setEditAccessible(existing.accessible)
        return
      }
      setDraftNode({ px, py, x: px * scaleMpp, y: py * scaleMpp })
      setShowNodeForm(true)
    }
    if (mode === 'placing-edges') {
      const clicked = getNodeAtPixel(px, py)
      if (!clicked) return
      if (!edgeStart) { setEdgeStart(clicked) }
      else {
        if (edgeStart.id !== clicked.id) { setDraftEdge({ from: edgeStart, to: clicked }); setShowEdgeForm(true) }
        setEdgeStart(null)
      }
    }
  }

  async function saveNode(e: React.FormEvent) {
    e.preventDefault()
    if (!draftNode) return

    const res = await fetch('/api/admin/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId,
        floor: floorNumber,
        label: nodeLabel,
        type: nodeType,
        x: draftNode.x,
        y: draftNode.y,
        accessible: nodeAccessible
      })
    })

    if (res.ok) {
      const newNode = await res.json()
      setNodes([...nodes, {
        id: newNode.id,
        label: newNode.label,
        type: newNode.type,
        x: newNode.x,
        y: newNode.y,
        accessible: newNode.accessible
      }])
    }
    
    setShowNodeForm(false)
    setDraftNode(null)
    setNodeLabel('')
    setNodeType('junction')
    setNodeAccessible(true)
  }

  async function saveEdge(e: React.FormEvent) {
    e.preventDefault()
    if (!draftEdge) return

    const dx = draftEdge.to.x - draftEdge.from.x
    const dy = draftEdge.to.y - draftEdge.from.y
    const distanceM = Math.sqrt(dx * dx + dy * dy)

    const res = await fetch('/api/admin/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospitalId,
        fromNode: draftEdge.from.id,
        toNode: draftEdge.to.id,
        distanceM,
        accessible: edgeAccessible,
        isStairs: edgeIsStairs,
        isElevator: edgeIsElevator,
        landmark: edgeLandmark || null
      })
    })

    if (res.ok) {
      const newEdge = await res.json()
      setEdges([...edges, {
        id: newEdge.id,
        fromNode: newEdge.from_node,
        toNode: newEdge.to_node,
        distanceM: newEdge.distance_m,
        accessible: newEdge.accessible,
        isStairs: newEdge.is_stairs,
        isElevator: newEdge.is_elevator,
        landmark: newEdge.landmark
      }])
    }

    setShowEdgeForm(false)
    setDraftEdge(null)
    setEdgeLandmark('')
    setEdgeIsStairs(false)
    setEdgeIsElevator(false)
    setEdgeAccessible(true)
  }

  async function saveEditNode() {
    if (!editingNode) return
    const res = await fetch('/api/admin/nodes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingNode.id, label: editLabel, type: editType, accessible: editAccessible }) })
    if (res.ok) setNodes(nodes.map(n => n.id === editingNode.id ? { ...n, label: editLabel, type: editType, accessible: editAccessible } : n))
    setEditingNode(null)
  }

  async function deleteNode(nodeId: string) {
    if (!confirm('Delete this node and all its connections?')) return
    await fetch('/api/admin/nodes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: nodeId }) })
    setNodes(nodes.filter(n => n.id !== nodeId))
    setEdges(edges.filter(e => e.fromNode !== nodeId && e.toNode !== nodeId))
    setEditingNode(null)
  }

  async function deleteEdge(edgeId: string) {
    await fetch('/api/admin/edges', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: edgeId }) })
    setEdges(edges.filter(e => e.id !== edgeId))
  }



  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 size={32} className="animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">{uploadStatus || 'Loading...'}</p>
      </div>
    )
  }

  if (!floorPlanUrl) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="max-w-md w-full p-8 border border-border bg-black/40 rounded-2xl text-center space-y-4">
          <Upload className="mx-auto text-muted-foreground w-12 h-12" />
          <h2 className="text-xl font-medium">Upload Floor Plan or PDF</h2>
          <p className="text-muted-foreground text-sm">Upload an image or multi-floor PDF for Floor {floorNumber}. Multi-page PDFs will automatically import all floors sequentially.</p>
          <label className="block bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium cursor-pointer transition-colors">
            Select File
            <input type="file" className="hidden" accept="image/*,.pdf,application/pdf" onChange={handleUpload} />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col h-screen overflow-hidden">
      {/* Top Toolbar */}
      <div className="min-h-16 h-auto py-3 md:py-0 border-b border-border bg-black/80 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-6 gap-3 shrink-0 z-10">
        <div>
          <h1 className="font-medium text-lg">Hospital {hospitalId} <span className="text-muted-foreground mx-2">/</span> Floor {floorNumber}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setMode('calibrating'); resetCalibration() }}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors ${mode === 'calibrating' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Maximize size={16} className="mr-2" /> {scaleMpp ? 'Re-Calibrate' : 'Calibrate'}
          </button>
          <button
            onClick={() => setMode('placing-nodes')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors ${mode === 'placing-nodes' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Plus size={16} className="mr-2" /> Nodes
          </button>
          <button
            onClick={() => { setMode('placing-edges'); setEdgeStart(null); }}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors ${mode === 'placing-edges' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Move size={16} className="mr-2" /> Edges
          </button>
          <label className="px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
            <Upload size={16} className="mr-2" /> JSON
            <input type="file" className="hidden" accept=".json,application/json" onChange={handleJsonUpload} />
          </label>

          
          <div className="flex items-center gap-1 border-l border-border/50 pl-2 ml-2">
            <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
              <ZoomOut size={18} />
            </button>
            <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
              <ZoomIn size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Editor Workspace */}
      <div className="flex-1 overflow-auto bg-[#0a0a0a] relative p-0 sm:p-4 md:p-8">
        
        {/* Helper text overlay */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-4 md:px-6 py-2 md:py-3 rounded-full text-xs md:text-sm border border-border shadow-2xl z-20 pointer-events-none whitespace-nowrap">
          {mode === 'calibrating' && calibStep === 'point-a' && 'Click a point to start calibration'}
          {mode === 'calibrating' && calibStep === 'point-b' && 'Click a second point to measure'}
          {mode === 'calibrating' && calibStep === 'enter-distance' && 'Enter the real-world distance'}
          {mode === 'placing-nodes' && 'Click map to add · click existing node to edit/delete'}
          {mode === 'placing-edges' && !edgeStart && 'Click a node to start edge'}
          {mode === 'placing-edges' && edgeStart && 'Click another node to connect'}

        </div>

        <div className="relative inline-block border border-border/50 shadow-2xl bg-black rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={floorPlanUrl}
            alt="Floor plan map"
            onClick={handleImageClick}
            onLoad={e => { const img = e.currentTarget; setImgW(img.naturalWidth); setImgH(img.naturalHeight) }}
            className={`block max-w-none ${mode === 'calibrating' ? 'cursor-crosshair' : mode === 'placing-nodes' ? 'cursor-cell' : 'cursor-pointer'}`}
            draggable={false}
            ref={imgRef}
            style={{ width: imgW ? imgW * zoom : undefined }}
          />
          
          <svg
            className="absolute inset-0 pointer-events-none"
            viewBox={`0 0 ${imgW || 0} ${imgH || 0}`}
            style={{ 
              width: imgW ? imgW * zoom : undefined, 
              height: imgH ? imgH * zoom : undefined 
            }}
          >
            {/* Draw Edges */}
            {edges.map(edge => {
              const from = nodes.find(n => n.id === edge.fromNode)
              const to = nodes.find(n => n.id === edge.toNode)
              if (!from || !to || !scaleMpp) return null
              return (
                <line
                  key={edge.id}
                  x1={from.x / scaleMpp} y1={from.y / scaleMpp}
                  x2={to.x / scaleMpp}   y2={to.y / scaleMpp}
                  stroke={edge.isStairs ? '#ef4444' : edge.isElevator ? '#f59e0b' : '#3b82f6'}
                  strokeWidth={3}
                  strokeDasharray={edge.isElevator || edge.isStairs ? '6 4' : undefined}
                />
              )
            })}


            
            {/* Active Edge Drawing */}
            {edgeStart && scaleMpp && (
              <circle cx={edgeStart.x / scaleMpp} cy={edgeStart.y / scaleMpp} r={12} fill="none" stroke="#fff" strokeWidth={3} strokeDasharray="4 2" />
            )}

            {/* Draw Nodes */}
            {nodes.map(node => {
              if (!scaleMpp) return null
              const isEntry = node.type === 'entry'
              const isDest = node.type === 'destination'
              const isJunction = node.type === 'junction'
              const color = isDest ? '#10b981' : isEntry ? '#a855f7' : isJunction ? '#6366f1' : '#f59e0b'
              const isEditing = editingNode?.id === node.id
              return (
                <g key={node.id}>
                  {isEditing && <circle cx={node.x / scaleMpp} cy={node.y / scaleMpp} r={14} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="3 2" />}
                  <circle
                    cx={node.x / scaleMpp}
                    cy={node.y / scaleMpp}
                    r={8}
                    fill={color}
                    stroke="#000"
                    strokeWidth={2}
                  />
                  <text
                    x={node.x / scaleMpp}
                    y={(node.y / scaleMpp) - 12}
                    textAnchor="middle"
                    fill="white"
                    className="text-[10px] font-medium"
                    style={{ textShadow: '0 1px 3px black' }}
                  >
                    {node.label}
                  </text>
                </g>
              )
            })}



            {/* Calibration Visuals */}
            {calibPtA && <circle cx={calibPtA.px} cy={calibPtA.py} r={6} fill="#f59e0b" stroke="#000" strokeWidth={2} />}
            {calibPtB && <circle cx={calibPtB.px} cy={calibPtB.py} r={6} fill="#f59e0b" stroke="#000" strokeWidth={2} />}
            {calibPtA && calibPtB && (
              <line
                x1={calibPtA.px} y1={calibPtA.py}
                x2={calibPtB.px} y2={calibPtB.py}
                stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2"
              />
            )}
            
            {/* Draft Node */}
            {draftNode && (
              <circle cx={draftNode.px} cy={draftNode.py} r={8} fill="#6366f1" stroke="#fff" strokeWidth={2} className="animate-pulse" />
            )}
          </svg>
        </div>
      </div>

      {/* Calibration Distance Input */}
      {mode === 'calibrating' && calibStep === 'enter-distance' && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border p-6 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="font-semibold text-lg mb-2">Calibration</h3>
            <p className="text-sm text-muted-foreground">Enter the real-world distance between the two points.</p>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick picks:</p>
              <div className="flex flex-wrap gap-2">
                {SCALE_PRESETS.map(p => (
                  <button key={p.label} onClick={() => setRealDistM(String(p.value))} className={`px-3 py-1 rounded-full text-xs border transition-colors ${realDistM === String(p.value) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50 hover:bg-white/5'}`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div>
              <input
                type="number"
                placeholder="Distance in meters (e.g. 10)"
                value={realDistM}
                onChange={e => setRealDistM(e.target.value)}
                className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
              {realDistM && calibPtA && calibPtB && (() => {
                const dx = calibPtB.px - calibPtA.px, dy = calibPtB.py - calibPtA.py
                const mpp = parseFloat(realDistM) / Math.sqrt(dx*dx + dy*dy)
                return <p className="text-xs text-muted-foreground mt-1">Scale: 1 px = {mpp.toFixed(4)} m &nbsp;·&nbsp; 1 m ≈ {Math.round(1/mpp)} px</p>
              })()}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={resetCalibration} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Reset</button>
              <button onClick={confirmCalibration} disabled={!realDistM} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Node Modal */}
      {showNodeForm && draftNode && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={saveNode} className="bg-background border border-border p-6 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-lg">Add Node</h3>
              <button type="button" onClick={() => { setShowNodeForm(false); setDraftNode(null); }} className="text-muted-foreground hover:text-foreground"><X size={20}/></button>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Label</label>
              <input type="text" value={nodeLabel} onChange={e => setNodeLabel(e.target.value)} placeholder="e.g. Corridor A" className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" required autoFocus />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <select value={nodeType} onChange={e => setNodeType(e.target.value as NodeData['type'])} className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                <option value="junction" className="bg-background">Junction</option>
                <option value="destination" className="bg-background">Destination</option>
                <option value="entry" className="bg-background">Entry</option>
                <option value="elevator" className="bg-background">Elevator</option>
                <option value="stairs" className="bg-background">Stairs</option>
              </select>
            </div>
            
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" checked={nodeAccessible} onChange={e => setNodeAccessible(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
              <span className="text-sm">Wheelchair Accessible</span>
            </label>

            <button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors">
              Save Node
            </button>
          </form>
        </div>
      )}

      {/* Add Edge Modal */}
      {showEdgeForm && draftEdge && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={saveEdge} className="bg-background border border-border p-6 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-lg">Add Connection</h3>
              <button type="button" onClick={() => { setShowEdgeForm(false); setDraftEdge(null); }} className="text-muted-foreground hover:text-foreground"><X size={20}/></button>
            </div>
            
            <p className="text-sm text-muted-foreground">Connecting <span className="font-medium text-foreground">{draftEdge.from.label}</span> to <span className="font-medium text-foreground">{draftEdge.to.label}</span>.</p>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Landmark (Optional)</label>
              <input type="text" value={edgeLandmark} onChange={e => setEdgeLandmark(e.target.value)} placeholder="e.g. after the pharmacy" className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            
            <div className="space-y-2 pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={edgeAccessible} onChange={e => setEdgeAccessible(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">Wheelchair Accessible</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={edgeIsStairs} onChange={e => setEdgeIsStairs(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">Is Stairs</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" checked={edgeIsElevator} onChange={e => setEdgeIsElevator(e.target.checked)} className="rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm">Is Elevator</span>
              </label>
            </div>

            <button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md text-sm font-medium transition-colors">
              Save Connection
            </button>
          </form>
        </div>
      )}

      {/* Node edit/delete modal */}
      {editingNode && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background border border-border p-6 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Edit Node</h3>
              <button onClick={() => setEditingNode(null)}><X size={20} /></button>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Label</label>
              <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <select value={editType} onChange={e => setEditType(e.target.value as NodeData['type'])} className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none">
                {(['junction','destination','entry','elevator','stairs'] as const).map(t => <option key={t} value={t} className="bg-background capitalize">{t}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editAccessible} onChange={e => setEditAccessible(e.target.checked)} />
              <span className="text-sm">Wheelchair Accessible</span>
            </label>
            {edges.filter(e => e.fromNode === editingNode.id || e.toNode === editingNode.id).length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground mb-2">Connected edges:</p>
                {edges.filter(e => e.fromNode === editingNode.id || e.toNode === editingNode.id).map(edge => {
                  const otherId = edge.fromNode === editingNode.id ? edge.toNode : edge.fromNode
                  const other = nodes.find(n => n.id === otherId)
                  return (
                    <div key={edge.id} className="flex items-center justify-between py-1">
                      <span className="text-xs text-muted-foreground">→ {other?.label ?? '?'} ({edge.distanceM.toFixed(1)}m)</span>
                      <button onClick={() => deleteEdge(edge.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={12} /></button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2 justify-between pt-2">
              <button onClick={() => deleteNode(editingNode.id)} className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 border border-red-400/30 rounded-md">
                <Trash2 size={14} /> Delete Node
              </button>
              <button onClick={saveEditNode} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
