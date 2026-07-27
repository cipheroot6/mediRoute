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
  
  // Convert frontend camelCase to database snake_case
  const insertData: Record<string, unknown> = {
    hospital_id: body.hospitalId,
    floor_number: body.floorNumber,
  }
  if (body.floorPlanUrl !== undefined) insertData.floor_plan_url = body.floorPlanUrl
  if (body.scaleMpp !== undefined) insertData.scale_mpp = body.scaleMpp

  // Use upsert to gracefully update if the floor row already exists (prevents unique constraint 400 errors)
  const { data, error } = await supabase
    .from('floors')
    .upsert(insertData, { onConflict: 'hospital_id,floor_number' })
    .select()
    .single()
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const supabase = createAdminClient()
  const { hospitalId, floorNumber, floorPlanUrl, scaleMpp, ...rest } = body
  
  // Convert frontend camelCase to database snake_case
  const updateFields: Record<string, unknown> = { ...rest }
  if (floorPlanUrl !== undefined) updateFields.floor_plan_url = floorPlanUrl
  if (scaleMpp !== undefined) updateFields.scale_mpp = scaleMpp

  const { data, error } = await supabase
    .from('floors')
    .update(updateFields)
    .eq('hospital_id', hospitalId)
    .eq('floor_number', floorNumber)
    .select()
    .single()
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
