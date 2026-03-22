import { NextResponse } from 'next/server'

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(
  code: string,
  message: string,
  status: number
) {
  return NextResponse.json(
    { error: { code, message } },
    { status }
  )
}
