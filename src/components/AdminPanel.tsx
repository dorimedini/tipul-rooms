"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile, InvitedEmail } from "@/lib/supabase/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { LocationsManager } from "./LocationsManager";
import { format, parseISO } from "date-fns";

interface Props {
  currentUser: Profile;
  onClose: () => void;
  onSelfDemoted: () => void;
  onLocationsChanged: () => void;
}

export function AdminPanel({ currentUser, onClose, onSelfDemoted, onLocationsChanged }: Props) {
  const supabase = createClient();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<InvitedEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showLocations, setShowLocations] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: p }, { data: i }] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("invited_emails").select("*").order("email"),
    ]);
    setProfiles(p ?? []);
    setInvites(i ?? []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function notify(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null); }
    else { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 4000);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setLoading(true);
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) { setNewEmail(""); notify("Invite added."); await refresh(); }
    else notify(data.error, true);
  }

  async function removeInvite(email: string) {
    const res = await fetch("/api/admin/invite", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) { notify("Invite removed."); await refresh(); }
    else { const d = await res.json(); notify(d.error, true); }
  }

  async function toggleAdmin(profile: Profile) {
    const action = profile.is_admin ? "revoke_admin" : "grant_admin";
    const res = await fetch(`/api/admin/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) { notify(`Admin ${profile.is_admin ? "revoked" : "granted"}.`); await refresh(); }
    else notify(data.error, true);
  }

  async function relinquishSelf() {
    const res = await fetch(`/api/admin/users/${currentUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "relinquish_self" }),
    });
    const data = await res.json();
    if (res.ok) { onSelfDemoted(); }
    else notify(data.error, true);
  }

  // Registered emails (have profiles)
  const registeredEmails = new Set(profiles.map(p => p.email.toLowerCase()));

  // Pending invites: invited but not yet registered
  const pendingInvites = invites.filter(i => !registeredEmails.has(i.email.toLowerCase()));

  // Another admin who has logged in (for relinquish eligibility)
  const canRelinquish = profiles.some(
    p => p.id !== currentUser.id && p.is_admin && p.last_login_at !== null
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">Admin</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">

        {/* Registered users */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Registered users</h3>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {p.name}
                    {p.is_admin && <Badge className="text-xs bg-blue-100 text-blue-700 border-0">Admin</Badge>}
                    {p.id === currentUser.id && <span className="text-xs text-gray-400">(you)</span>}
                  </div>
                  <div className="text-xs text-gray-400">{p.email}</div>
                  {p.last_login_at && (
                    <div className="text-xs text-gray-300">
                      Last login: {format(parseISO(p.last_login_at), "MMM d, yyyy")}
                    </div>
                  )}
                </div>
                {p.id !== currentUser.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleAdmin(p)}
                    className="text-xs"
                  >
                    {p.is_admin ? "Revoke admin" : "Grant admin"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Invite new user */}
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Invite user</h3>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 border rounded-md px-3 py-2 text-sm"
              required
            />
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "…" : "Invite"}
            </Button>
          </form>
        </section>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">
              Pending invites ({pendingInvites.length})
            </h3>
            <div className="space-y-1">
              {pendingInvites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm text-gray-600">{inv.email}</span>
                  <button
                    onClick={() => removeInvite(inv.email)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Locations & Rooms */}
        <section className="pt-2 border-t">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Locations &amp; Rooms</h3>
          <Button variant="outline" size="sm" onClick={() => setShowLocations(true)}>
            Manage locations &amp; rooms
          </Button>
        </section>

        {/* Relinquish own admin */}
        <section className="pt-2 border-t">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Relinquish admin</h3>
          <p className="text-xs text-gray-500 mb-3">
            You can remove your own admin status only if another admin has already logged in.
            {!canRelinquish && " (No other admin has logged in yet.)"}
          </p>
          <Button
            variant="destructive"
            size="sm"
            disabled={!canRelinquish}
            onClick={relinquishSelf}
          >
            Remove my admin status
          </Button>
        </section>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}
      </div>

      <LocationsManager
        open={showLocations}
        onClose={() => setShowLocations(false)}
        onChanged={onLocationsChanged}
      />
    </div>
  );
}
