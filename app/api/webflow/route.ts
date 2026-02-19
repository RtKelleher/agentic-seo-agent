import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, token, siteId, collectionId } = body

    if (!token) {
      return NextResponse.json({ error: 'Webflow API token is required' }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    switch (action) {
      case 'list_sites': {
        const res = await fetch('https://api.webflow.com/v2/sites', { headers })
        if (!res.ok) {
          const err = await res.text()
          return NextResponse.json({ error: `Webflow API error: ${err}` }, { status: res.status })
        }
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'list_collections': {
        if (!siteId) {
          return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
        }
        const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, { headers })
        if (!res.ok) {
          const err = await res.text()
          return NextResponse.json({ error: `Webflow API error: ${err}` }, { status: res.status })
        }
        const data = await res.json()
        return NextResponse.json(data)
      }

      case 'get_schema': {
        if (!collectionId) {
          return NextResponse.json({ error: 'collectionId is required' }, { status: 400 })
        }
        const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}`, { headers })
        if (!res.ok) {
          const err = await res.text()
          return NextResponse.json({ error: `Webflow API error: ${err}` }, { status: res.status })
        }
        const data = await res.json()

        // Convert fields to markdown string
        const fields = data.fields || []
        const lines = ['# Collection Schema', '', `**Name:** ${data.displayName || data.slug || collectionId}`, '']
        lines.push('| Field Slug | Display Name | Type | Required |')
        lines.push('|---|---|---|---|')
        for (const f of fields) {
          lines.push(`| ${f.slug} | ${f.displayName || f.slug} | ${f.type} | ${f.isRequired ? 'Yes' : 'No'} |`)
        }
        const schemaMd = lines.join('\n')

        return NextResponse.json({ ...data, schemaMd })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webflow API request failed' },
      { status: 500 }
    )
  }
}
