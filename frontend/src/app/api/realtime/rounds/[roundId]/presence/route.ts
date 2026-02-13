import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params
  const token = request.headers.get('authorization')

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/realtime/rounds/${roundId}/presence`, {
      headers: {
        'Authorization': token || '',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[API Proxy] Presence GET error:', err)
    return NextResponse.json({ peer_online: false }, { status: 200 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const { roundId } = await params
  const token = request.headers.get('authorization')

  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/realtime/rounds/${roundId}/presence`, {
      method: 'POST',
      headers: {
        'Authorization': token || '',
        'Content-Type': 'application/json',
      },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[API Proxy] Presence POST error:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
