import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  // Single row — graph.ts expands to both directions at load time
  const { data, error } = await supabase
    .from('edges')
    .insert({
      hospital_id: body.hospitalId,
      from_node: body.fromNode,
      to_node: body.toNode,
      distance_m: body.distanceM,
      accessible: body.accessible ?? true,
      is_stairs: body.isStairs ?? false,
      is_elevator: body.isElevator ?? false,
      landmark: body.landmark ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('edges').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('edges').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
