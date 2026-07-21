import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anchorId: string }> }
) {
  const { anchorId } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('qr_anchors')
    .select('anchor_id, node_id, hospital_id, nodes(id, label, floor, x, y)')
    .eq('anchor_id', anchorId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Anchor not found' }, { status: 404 })
  }

  return NextResponse.json({
    anchorId: data.anchor_id,
    nodeId: data.node_id,
    hospitalId: data.hospital_id,
    node: data.nodes,
  })
}
