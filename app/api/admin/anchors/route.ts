import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const hospitalId = req.nextUrl.searchParams.get('hospitalId')
  if (!hospitalId) {
    return NextResponse.json({ error: 'hospitalId required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('qr_anchors')
    .select('*')
    .eq('hospital_id', hospitalId)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('qr_anchors')
    .insert({
      anchor_id: body.anchorId,
      node_id: body.nodeId,
      hospital_id: body.hospitalId,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { anchorId } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('qr_anchors').delete().eq('anchor_id', anchorId)
  return NextResponse.json({ ok: true })
}
