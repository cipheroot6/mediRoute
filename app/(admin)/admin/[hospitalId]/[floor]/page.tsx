'use client'
import { useState, useRef, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Maximize, MousePointer2, Move, Upload, Save, X, ZoomIn, ZoomOut } from 'lucide-react'

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
        setScaleMpp(floorData.scale_mpp)
        if (floorData.floor_plan_url && !floorData.scale_mpp) {
          setMode('calibrating')
        }
      } else {
        // Floor doesn't exist yet, insert it
        await supabase.from('floors').insert({
          hospital_id: hospitalId,
          floor_number: floorNumber
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
  }, [hospitalId, floorNumber])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${hospitalId}-${floorNumber}-${Math.random()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('floor-plans')
      .upload(fileName, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setLoading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('floor-plans')
      .getPublicUrl(fileName)

    await fetch('/api/admin/floors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, floorNumber, floorPlanUrl: publicUrl })
    })

    setFloorPlanUrl(publicUrl)
    setMode('calibrating')
    setLoading(false)
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
    const pixelDist = Math.sqrt(dx * dx + dy * dy)
    const newScaleMpp = parseFloat(realDistM) / pixelDist

    await fetch('/api/admin/floors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalId, floorNumber, scaleMpp: newScaleMpp })
    })

    setScaleMpp(newScaleMpp)
    setCalibStep('done')
    setMode('placing-nodes')
  }

  function getNodeAtPixel(px: number, py: number) {
    if (!scaleMpp) return null
    const threshold = 15 // px
    for (const node of nodes) {
      const nx = node.x / scaleMpp
      const ny = node.y / scaleMpp
      const dist = Math.sqrt(Math.pow(nx - px, 2) + Math.pow(ny - py, 2))
      if (dist < threshold) return node
    }
    return null
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    // Calculate click position relative to the image's original dimensions
    // nativeEvent.offsetX / offsetY gives coordinates relative to the rendered size.
    // We divide by zoom to get back to the original pixels.
    const px = e.nativeEvent.offsetX / zoom
    const py = e.nativeEvent.offsetY / zoom

    if (mode === 'calibrating') {
      handleCalibrationClick(px, py)
      return
    }

    if (mode === 'placing-nodes') {
      if (!scaleMpp) return
      const x = px * scaleMpp
      const y = py * scaleMpp
      setDraftNode({ px, py, x, y })
      setShowNodeForm(true)
    }

    if (mode === 'placing-edges') {
      const clicked = getNodeAtPixel(px, py)
      if (!clicked) return
      if (!edgeStart) {
        setEdgeStart(clicked)
      } else {
        if (edgeStart.id !== clicked.id) {
          setDraftEdge({ from: edgeStart, to: clicked })
          setShowEdgeForm(true)
        }
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p>Loading...</p></div>
  }

  if (!floorPlanUrl) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="max-w-md w-full p-8 border border-border bg-black/40 rounded-2xl text-center space-y-4">
          <Upload className="mx-auto text-muted-foreground w-12 h-12" />
          <h2 className="text-xl font-medium">Upload Floor Plan</h2>
          <p className="text-muted-foreground text-sm">Upload a PNG or JPG of Floor {floorNumber}.</p>
          <label className="block bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium cursor-pointer transition-colors">
            Select File
            <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
          </label>
        </div>
      </div>
    )
  }

  // To display bidirectional edges smoothly (since graph creates reverse edge virtually, but DB only has one row),
  // we just draw all edges from the `edges` state directly.

  return (
    <div className="min-h-screen bg-background flex flex-col h-screen overflow-hidden">
      {/* Top Toolbar */}
      <div className="min-h-16 h-auto py-3 md:py-0 border-b border-border bg-black/80 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between px-4 md:px-6 gap-3 shrink-0 z-10">
        <div>
          <h1 className="font-medium text-lg">Hospital {hospitalId} <span className="text-muted-foreground mx-2">/</span> Floor {floorNumber}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!scaleMpp && (
            <div className="px-3 py-1 bg-yellow-500/10 text-yellow-500 text-sm font-medium rounded-full border border-yellow-500/20">
              Calibration Required
            </div>
          )}
          <button
            onClick={() => setMode('calibrating')}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors ${mode === 'calibrating' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Maximize size={16} className="mr-2" /> Calibrate
          </button>
          <button
            onClick={() => setMode('placing-nodes')}
            disabled={!scaleMpp}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'placing-nodes' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Plus size={16} className="mr-2" /> Nodes
          </button>
          <button
            onClick={() => { setMode('placing-edges'); setEdgeStart(null); }}
            disabled={!scaleMpp}
            className={`px-4 py-2 rounded-md text-sm font-medium flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'placing-edges' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground'}`}
          >
            <Move size={16} className="mr-2" /> Edges
          </button>
          
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
          {mode === 'placing-nodes' && 'Click on the map to add a node'}
          {mode === 'placing-edges' && !edgeStart && 'Click a node to start edge'}
          {mode === 'placing-edges' && edgeStart && 'Click another node to connect'}
        </div>

        <div className="relative inline-block border border-border/50 shadow-2xl bg-black rounded-lg overflow-hidden">
          <img
            src={floorPlanUrl}
            onClick={handleImageClick}
            className={`block max-w-none ${mode === 'calibrating' ? 'cursor-crosshair' : mode === 'placing-nodes' ? 'cursor-cell' : 'cursor-pointer'}`}
            draggable={false}
            ref={imgRef}
            style={{ width: imgRef.current?.naturalWidth ? imgRef.current.naturalWidth * zoom : undefined }}
          />
          
          <svg
            className="absolute inset-0 pointer-events-none"
            viewBox={`0 0 ${imgRef.current?.naturalWidth || 0} ${imgRef.current?.naturalHeight || 0}`}
            style={{ 
              width: imgRef.current?.naturalWidth ? imgRef.current.naturalWidth * zoom : undefined, 
              height: imgRef.current?.naturalHeight ? imgRef.current.naturalHeight * zoom : undefined 
            }}
          >
            {/* Draw Edges */}
            {edges.map(edge => {
              const from = nodes.find(n => n.id === edge.fromNode)
              const to = nodes.find(n => n.id === edge.toNode)
              if (!from || !to || !scaleMpp) return null
              // Only draw edges where at least one node is on this floor.
              // In this view, we're assuming both nodes are on this floor (except elevators).
              // For a true cross-floor view, we'd need more logic, but this is fine for same-floor.
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
              return (
                <g key={node.id}>
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
          <div className="bg-background border border-border p-6 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-lg mb-2">Calibration</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter the real-world distance between the two points.</p>
            <input
              type="number"
              placeholder="Distance in meters (e.g. 10)"
              value={realDistM}
              onChange={e => setRealDistM(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCalibStep('point-a')} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Reset</button>
              <button onClick={confirmCalibration} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Confirm</button>
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
    </div>
  )
}
