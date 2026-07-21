import { NextRequest, NextResponse } from 'next/server'
import { loadGraph } from '@/lib/pathfinding/graph'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const graph = await loadGraph(id)
    return NextResponse.json(graph)
  } catch {
    return NextResponse.json({ error: 'Hospital not found' }, { status: 404 })
  }
}
