import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

function getRootDomain(): string {
  const configured = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  if (configured) return configured.replace(/:.*/, '')
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return vercelUrl
  return ''
}

function rewriteTenant(
  request: NextRequest,
  slug: string | null,
  domain: string | null,
  pathname: string
) {
  const url = request.nextUrl.clone()
  const identifier = slug ?? domain!
  url.pathname = `/${identifier}${pathname}`

  const requestHeaders = new Headers(request.headers)
  if (slug) requestHeaders.set('x-tenant-slug', slug)
  if (domain) requestHeaders.set('x-tenant-domain', domain)

  return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? new URL(request.url).hostname
  const { pathname } = new URL(request.url)

  const host = hostname.replace(/:.*/, '')
  const rootHost = getRootDomain()

  const isLocalhost = host === 'localhost' || host === '127.0.0.1'
  const isRootSite =
    isLocalhost || (rootHost !== '' && (host === rootHost || host === `www.${rootHost}`))
  const isSubdomain = !isLocalhost && rootHost !== '' && host.endsWith(`.${rootHost}`)

  if (isSubdomain) {
    const slug = host.replace(`.${rootHost}`, '')
    return rewriteTenant(request, slug, null, pathname)
  }

  if (!isRootSite) {
    return rewriteTenant(request, null, host, pathname)
  }

  // -- Main site logic (marketing, auth, dashboard, admin) --

  const needsAuth = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  if (!needsAuth) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!supabaseUrl.startsWith('http')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { supabaseResponse, user, supabase } = await updateSession(request)

  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
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
    '/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
