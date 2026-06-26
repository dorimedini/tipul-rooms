"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-md p-10 flex flex-col items-center gap-4 w-full max-w-sm text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="text-xl font-semibold text-gray-900">Access not granted</h1>
        <p className="text-gray-500 text-sm">
          Your account hasn&apos;t been registered yet. Ask an admin to add your email address.
        </p>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
