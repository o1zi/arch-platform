import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// التعديل 1: استخدام الرابط الرسمي أو القيمة الافتراضية
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'arch-platform.vercel.app'

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? new URL(request.url).hostname
  const { pathname } = new URL(request.url)

  // التعديل 2: إضافة Log لمراقبة المسارات في الـ Console
  console.log("Middleware check:", { pathname, host: hostname });

  const host = hostname.replace(/:.*/, '')
  const rootHost = ROOT_DOMAIN.replace(/:.*/, '')

  let tenantSlug: string | null = null
  let tenantDomain: string | null = null

  if (host === rootHost || host === `www.${rootHost}`) {
    // Main domain
  } else if (host.endsWith(`.${rootHost}`)) {
    tenantSlug = host.replace(`.${rootHost}`, '')
  } else {
    tenantDomain = host
  }

  if (tenantSlug || tenantDomain) {
    const url = request.nextUrl.clone()
    const identifier = tenantSlug ?? tenantDomain!
    url.pathname = `/${identifier}${pathname}`

    const requestHeaders = new Headers(request.headers)
    if (tenantSlug) requestHeaders.set('x-tenant-slug', tenantSlug)
    if (tenantDomain) requestHeaders.set('x-tenant-domain', tenantDomain)

    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  const needsAuth = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  if (!needsAuth) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  
  // التعديل 2 (تابع): مراقبة خطأ الاتصال
  if (!supabaseUrl.startsWith('https')) {
    console.error("Supabase URL is invalid or missing:", supabaseUrl);
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
    
    // التعديل 3: إضافة Log لاكتشاف أخطاء الـ RLS أو قاعدة البيانات
    const { data: adminRecord, error: adminError } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (adminError) {
      console.error("Admin Check Error (Check RLS Policies):", adminError);
    }

    if (!adminRecord) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

// التعديل 4: استثناء مسار تسجيل الدخول والملفات الثابتة
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
