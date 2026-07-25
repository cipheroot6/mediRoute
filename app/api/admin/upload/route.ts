import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { FLOOR_PLAN_BUCKET } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const fileName = formData.get('fileName') as string | null

    if (!file || !fileName) {
      return NextResponse.json({ error: 'Missing file or fileName in form data' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(FLOOR_PLAN_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type || 'image/png',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(FLOOR_PLAN_BUCKET)
      .getPublicUrl(fileName)

    return NextResponse.json({ publicUrl, fileName })
  } catch (err: unknown) {
    console.error('Upload route error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Server upload failed' },
      { status: 500 }
    )
  }
}
