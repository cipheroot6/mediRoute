'use client'
import { useState, useMemo } from 'react'
import { X, Sparkles, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react'
import type { AISuggestedNode, AISuggestedEdge } from '@/app/api/admin/analyze-floor/route'

interface Props {
  nodes: AISuggestedNode[]
  edges: AISuggestedEdge[]
  summary: string
  warnings: string[]
  saving: boolean
  onNodesChange: (nodes: AISuggestedNode[]) => void
  onEdgesChange: (edges: AISuggestedEdge[]) => void
  onConfirm: () => void
  onDiscard: () => void
}

const TYPE_LABELS: Record<AISuggestedNode['type'], string> = {
  destination: 'Destination',
  junction: 'Junction',
  elevator: 'Elevator',
  stairs: 'Stairs',
  entry: 'Entry',
}

const TYPE_COLORS: Record<AISuggestedNode['type'], string> = {
  destination: 'bg-emerald-500',
  junction: 'bg-indigo-500',
  elevator: 'bg-amber-500',
  stairs: 'bg-red-500',
  entry: 'bg-purple-500',
}

export default function AIReviewPanel({
  nodes, edges, summary, warnings,
  saving, onNodesChange, onEdgesChange, onConfirm, onDiscard,
}: Props) {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [showEdges, setShowEdges] = useState(false)

  // ── Node mutations ──────────────────────────────────────────────────────────
  function updateNode(tempId: string, patch: Partial<AISuggestedNode>) {
    onNodesChange(nodes.map(n => n.tempId === tempId ? { ...n, ...patch } : n))
  }

  function removeNode(tempId: string) {
    onNodesChange(nodes.filter(n => n.tempId !== tempId))
    // Also remove edges that reference this node
    onEdgesChange(edges.filter(e => e.fromTempId !== tempId && e.toTempId !== tempId))
  }

  // ── Edge mutations ──────────────────────────────────────────────────────────
  function removeEdge(tempId: string) {
    onEdgesChange(edges.filter(e => e.tempId !== tempId))
  }

  function labelForTempId(tempId: string) {
    return nodes.find(n => n.tempId === tempId)?.label ?? '?'
  }

  // Counts
  const destCount     = nodes.filter(n => n.type === 'destination').length
  const junctionCount = nodes.filter(n => n.type === 'junction').length
  const specialCount  = nodes.filter(n => n.type !== 'destination' && n.type !== 'junction').length

  return (
    <div className="flex flex-col h-full bg-black/90 backdrop-blur-xl border-l border-border w-full max-w-sm shrink-0 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-indigo-400" />
          <span className="font-semibold text-sm">AI Suggestions</span>
        </div>
        <button
          onClick={onDiscard}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Discard all AI suggestions"
        >
          <X size={18} />
        </button>
      </div>

      {/* Summary strip */}
      <div className="px-4 py-3 border-b border-border bg-indigo-500/5 shrink-0 space-y-1">
        <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {destCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
              {destCount} rooms
            </span>
          )}
          {junctionCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
              {junctionCount} junctions
            </span>
          )}
          {specialCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {specialCount} special
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
            {edges.length} connections
          </span>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-yellow-500/5 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-400/80">{w}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Node list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2 sticky top-0 bg-black/90 border-b border-border/50 z-10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Nodes ({nodes.length}) — edit or remove before saving
          </p>
        </div>

        {nodes.map(node => {
          const expanded = expandedNodeId === node.tempId
          return (
            <div key={node.tempId} className="border-b border-border/40 last:border-0">
              {/* Collapsed row */}
              <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TYPE_COLORS[node.type]}`} />
                <span className="text-sm flex-1 truncate">{node.label}</span>
                <button
                  onClick={() => setExpandedNodeId(expanded ? null : node.tempId)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                  title="Edit"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  onClick={() => removeNode(node.tempId)}
                  className="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors"
                  title="Remove this node"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded edit form */}
              {expanded && (
                <div className="px-4 pb-3 space-y-2.5 bg-white/[0.02]">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Label</label>
                    <input
                      type="text"
                      value={node.label}
                      onChange={e => updateNode(node.tempId, { label: e.target.value })}
                      className="w-full h-8 rounded-md border border-border bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Type</label>
                    <select
                      value={node.type}
                      onChange={e => updateNode(node.tempId, { type: e.target.value as AISuggestedNode['type'] })}
                      className="w-full h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {Object.entries(TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val} className="bg-background">{label}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={node.accessible}
                      onChange={e => updateNode(node.tempId, { accessible: e.target.checked })}
                      className="rounded border-border text-primary"
                    />
                    <span className="text-xs">Wheelchair accessible</span>
                  </label>
                  {node.notes && (
                    <p className="text-xs text-muted-foreground italic border-l-2 border-indigo-500/40 pl-2">{node.notes}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Edges section */}
        <div className="px-4 py-2 sticky top-0 bg-black/90 border-y border-border/50 z-10">
          <button
            onClick={() => setShowEdges(s => !s)}
            className="flex items-center gap-2 w-full text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            {showEdges ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Connections ({edges.length})
          </button>
        </div>

        {showEdges && edges.map(edge => (
          <div key={edge.tempId} className="flex items-center gap-2 px-4 py-2 border-b border-border/30 last:border-0 hover:bg-white/[0.02]">
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">
                <span className="text-foreground/80">{labelForTempId(edge.fromTempId)}</span>
                <span className="text-muted-foreground mx-1">→</span>
                <span className="text-foreground/80">{labelForTempId(edge.toTempId)}</span>
              </p>
              {(edge.isStairs || edge.isElevator) && (
                <p className="text-xs text-amber-400 mt-0.5">
                  {edge.isElevator ? '🛗 Elevator' : '🪜 Stairs'}
                </p>
              )}
            </div>
            <button
              onClick={() => removeEdge(edge.tempId)}
              className="text-muted-foreground hover:text-red-400 p-1 rounded transition-colors shrink-0"
              title="Remove connection"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
        <button
          onClick={onConfirm}
          disabled={saving || nodes.length === 0}
          className="w-full flex items-center justify-center gap-2 h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> Saving…</>
          ) : (
            <><CheckCircle2 size={16} /> Confirm & Save {nodes.length} nodes, {edges.length} edges</>
          )}
        </button>
        <button
          onClick={onDiscard}
          disabled={saving}
          className="w-full h-8 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Discard all suggestions
        </button>
      </div>
    </div>
  )
}
