import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase.from('floors').select('*').order('floor_number')
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('floors')
    .insert({
      hospital_id: body.hospitalId,
      floor_number: body.floorNumber,
      floor_plan_url: body.floorPlanUrl ?? null,
      scale_mpp: body.scaleMpp ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { hospitalId, floorNumber, ...fields } = body
  const { data, error } = await supabase
    .from('floors')
    .update(fields)
    .eq('hospital_id', hospitalId)
    .eq('floor_number', floorNumber)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
