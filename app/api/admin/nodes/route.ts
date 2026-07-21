import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('nodes')
    .insert({
      hospital_id: body.hospitalId,
      floor: body.floor,
      label: body.label,
      type: body.type,
      x: body.x,
      y: body.y,
      accessible: body.accessible ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { id, ...fields } = body
  const { data, error } = await supabase
    .from('nodes')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('nodes').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
