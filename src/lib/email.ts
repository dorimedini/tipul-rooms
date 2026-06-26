import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

const FROM = () => process.env.GMAIL_USER ?? "noreply@example.com";
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function html(body: string) {
  const url = APP_URL();
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;color:#333;max-width:560px;margin:0 auto;padding:24px">
${body}
<hr style="margin:32px 0;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#999">Tipul Rooms · <a href="${url}" style="color:#999">${url}</a></p>
</body></html>`;
}

async function send(to: string | string[], subject: string, body: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("[email] missing GMAIL_USER or GMAIL_APP_PASSWORD");
    return;
  }
  const targets = Array.isArray(to) ? to : [to];
  console.log("[email] sending to:", targets, "subject:", subject);
  try {
    await Promise.all(
      targets.map(t =>
        getTransport().sendMail({
          from: `Tipul Rooms <${FROM()}>`,
          to: t,
          subject,
          html: html(body),
        })
      )
    );
    console.log("[email] sent ok");
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

export async function emailInvite(opts: { toEmail: string; invitedByName: string }) {
  await send(
    opts.toEmail,
    "You've been invited to Tipul Rooms",
    `<p>Hi,</p>
<p><strong>${opts.invitedByName}</strong> has invited you to Tipul Rooms.</p>
<p>Sign in with your Google account (<strong>${opts.toEmail}</strong>) to get started.</p>
<p><a href="${APP_URL()}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Sign in to Tipul Rooms</a></p>`
  );
}

export async function emailSwapRequest(opts: {
  toEmail: string;
  toName: string;
  requesterName: string;
  requesterSlot: string;
  targetSlot: string;
}) {
  await send(
    opts.toEmail,
    `${opts.requesterName} wants to swap a session with you`,
    `<p>Hi ${opts.toName},</p>
<p><strong>${opts.requesterName}</strong> has sent you a swap request.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Their slot</td><td style="padding:4px 0"><strong>${opts.requesterSlot}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Your slot</td><td style="padding:4px 0"><strong>${opts.targetSlot}</strong></td></tr>
</table>
<p><a href="${APP_URL()}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Open Tipul Rooms to accept or decline</a></p>`
  );
}

export async function emailAdminGranted(opts: {
  toEmail: string;
  toName: string;
  grantedByName: string;
}) {
  await send(
    opts.toEmail,
    "You've been granted admin access to Tipul Rooms",
    `<p>Hi ${opts.toName},</p>
<p><strong>${opts.grantedByName}</strong> has given you admin access to Tipul Rooms.</p>
<p>You can now manage users, locations, and rooms.</p>
<p><a href="${APP_URL()}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Open Tipul Rooms</a></p>`
  );
}

export async function emailRoomAdded(opts: {
  toEmails: string[];
  roomName: string;
  locationName: string;
}) {
  await send(
    opts.toEmails,
    `New room available: ${opts.roomName} at ${opts.locationName}`,
    `<p>A new room has been added to Tipul Rooms.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Room</td><td style="padding:4px 0"><strong>${opts.roomName}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td style="padding:4px 0"><strong>${opts.locationName}</strong></td></tr>
</table>
<p><a href="${APP_URL()}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Open Tipul Rooms</a></p>`
  );
}

export async function emailRoomRemoved(opts: {
  toEmails: string[];
  roomName: string;
  locationName: string;
}) {
  await send(
    opts.toEmails,
    `Room removed: ${opts.roomName} at ${opts.locationName}`,
    `<p>A room has been removed from Tipul Rooms.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Room</td><td style="padding:4px 0"><strong>${opts.roomName}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666">Location</td><td style="padding:4px 0"><strong>${opts.locationName}</strong></td></tr>
</table>`
  );
}

export async function emailUnregisteredLogin(opts: {
  toEmails: string[];
  attemptedEmail: string;
}) {
  await send(
    opts.toEmails,
    `Unregistered login attempt: ${opts.attemptedEmail}`,
    `<p>Someone tried to sign in to Tipul Rooms but their email is not registered.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td style="padding:4px 0"><strong>${opts.attemptedEmail}</strong></td></tr>
</table>
<p>If you'd like to give them access, invite them from the admin panel.</p>
<p><a href="${APP_URL()}" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block">Open admin panel</a></p>`
  );
}
