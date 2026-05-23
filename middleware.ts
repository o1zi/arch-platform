import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000'

export async function middleware(request: NextRequest) {
  // Use Host header — more reliable than request.url in dev/proxy environments
  const hostname = request.headers.get('host') ?? new URL(request.url).hostname
  const { pathname } = new URL(request.url)

  const host = hostname.replace(/:.*/, '')
  const rootHost = ROOT_DOMAIN.replace(/:.*/, '')

  let tenantSlug: string | null = null
  let tenantDomain: string | null = null

  if (host === rootHost || host === `www.${rootHost}`) {
    // Main domain — marketing, dashboard, admin, login
  } else if (host.endsWith(`.${rootHost}`)) {
    tenantSlug = host.replace(`.${rootHost}`, '')
  } else {
    tenantDomain = host
  }

  // Rewrite tenant requests to [domain] route segment
  if (tenantSlug || tenantDomain) {
    const url = request.nextUrl.clone()
    const identifier = tenantSlug ?? tenantDomain!
    url.pathname = `/${identifier}${pathname}`

    // Pass headers on the REQUEST side so server components can read them via headers()
    const requestHeaders = new Headers(request.headers)
    if (tenantSlug) requestHeaders.set('x-tenant-slug', tenantSlug)
    if (tenantDomain) requestHeaders.set('x-tenant-domain', tenantDomain)

    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  // Only call Supabase for protected routes
  const needsAuth = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  if (!needsAuth) {
    return NextResponse.next()
  }

  // Supabase not configured — redirect to login with message
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!supabaseUrl.startsWith('http')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { supabaseResponse, user, supabase } = await updateSession(request)

  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const { data: adminRecord } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!adminRecord) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
