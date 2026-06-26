import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/unauthorized") ||
    path === "/api/notify-unregistered";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated but not registered → blocked
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_admin")
      .eq("id", user.id)
      .single();

    if (!profile) {
      // User authenticated but no profile — check if they've since been invited
      const { data: invite } = await supabase
        .from("invited_emails")
        .select("is_admin")
        .eq("email", (user.email ?? "").toLowerCase())
        .single();

      if (invite) {
        // Create their profile now and let them through
        await supabase.from("profiles").insert({
          id: user.id,
          name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Unknown",
          email: user.email ?? "",
          is_admin: (invite as any).is_admin ?? false,
        });
        return supabaseResponse;
      }

      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }

    // Admin-only routes
    if (path.startsWith("/admin") && !profile.is_admin) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
