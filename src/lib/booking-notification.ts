import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type BookingDetails = {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  notes: string | null;
  admin_notes: string | null;
  arrival_time: string | null;
  total_price: number | null;
  num_guests: number | null;
  created_at: string;
  updated_at: string;
  guest: { name: string; phone: string | null; email: string | null } | null;
  room: { name: string; price: number } | null;
  booking_rooms: Array<{
    room: { name: string; price: number } | null;
    price_per_night: number | null;
  }>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(
    0,
    Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000),
  );
}

function row(label: string, value: string | number): string {
  return `
    <tr>
      <td style="padding:8px 12px 8px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:600">${escapeHtml(String(value))}</td>
    </tr>`;
}

export const sendNewBookingEmail = createServerFn({ method: "POST" })
  .inputValidator((data: { bookingId: string }) => data)
  .handler(async ({ data }) => {
    const authorization = getRequestHeader("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Unauthorized notification request");

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Unauthorized notification request");

    const { data: role, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .in("role", ["admin", "staff"])
      .maybeSingle();
    if (roleError || !role) throw new Error("Only staff can send booking notifications");

    const { data: bookingData, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, check_in, check_out, status, notes, admin_notes, arrival_time, total_price, num_guests, created_at, updated_at, guest:guests(name, phone, email), room:rooms(name, price), booking_rooms(price_per_night, room:rooms(name, price))",
      )
      .eq("id", data.bookingId)
      .single();
    if (bookingError || !bookingData) throw new Error("Saved booking could not be loaded");

    const booking = bookingData as unknown as BookingDetails;
    const rooms = booking.booking_rooms?.map((item) => item.room?.name).filter(Boolean) as string[];
    if (!rooms.length && booking.room?.name) rooms.push(booking.room.name);

    const nights = nightsBetween(booking.check_in, booking.check_out);
    const roomText = rooms.length ? rooms.join(", ") : "—";
    const roomCount = rooms.length || (booking.room ? 1 : 0);
    const roomRates = booking.booking_rooms
      ?.map((item) => item.price_per_night === null ? null : `${item.room?.name ?? "Room"}: ${item.price_per_night}/night`)
      .filter(Boolean)
      .join(", ") || "—";
    const recipient = process.env.RESEND_ADMIN_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;
    if (!recipient) throw new Error("RESEND_ADMIN_EMAIL is not configured");
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    // Payment fields are not present in the current Supabase bookings schema.
    // State that fact rather than inventing values.
    const paymentStatus = "Not stored in current booking data";
    const paymentMethod = "Not stored in current booking data";
    const subject = `New booking — ${booking.guest?.name ?? "Guest"} (${formatDate(booking.check_in)})`;

    const details = [
      ["Booking ID", booking.id],
      ["Guest name", display(booking.guest?.name)],
      ["Guest email", display(booking.guest?.email)],
      ["Guest phone", display(booking.guest?.phone)],
      ["Room(s)", roomText],
      ["Number of rooms", roomCount],
      ["Room rate(s)", roomRates],
      ["Check-in", formatDate(booking.check_in)],
      ["Check-out", formatDate(booking.check_out)],
      ["Number of nights", nights],
      ["Number of guests", display(booking.num_guests)],
      ["Arrival time", display(booking.arrival_time)],
      ["Booking status", display(booking.status)],
      ["Payment status", paymentStatus],
      ["Payment method", paymentMethod],
      ["Booking total", booking.total_price === null ? "—" : String(booking.total_price)],
      ["Created at", formatDate(booking.created_at)],
      ["Last updated", formatDate(booking.updated_at)],
    ] as Array<[string, string | number]>;

    const text = [
      "New Lavista booking",
      "",
      ...details.map(([label, value]) => `${label}: ${value}`),
      "",
      `Guest special request: ${display(booking.notes)}`,
      `Admin notes: ${display(booking.admin_notes)}`,
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
        <div style="background:#111827;padding:24px 28px;border-radius:12px 12px 0 0">
          <div style="color:#fff;font-size:20px;font-weight:700">New Lavista booking</div>
          <div style="color:#cbd5e1;font-size:13px;margin-top:5px">${escapeHtml(subject.replace("New booking — ", ""))}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-top:0;padding:22px 28px;border-radius:0 0 12px 12px">
          <table style="border-collapse:collapse;width:100%">${details.map(([label, value]) => row(label, value)).join("")}</table>
          <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px">
            <div style="color:#64748b;font-size:13px;margin-bottom:5px">Guest special request</div>
            <div style="font-size:13px;white-space:pre-wrap">${escapeHtml(display(booking.notes))}</div>
            <div style="color:#64748b;font-size:13px;margin:16px 0 5px">Admin notes</div>
            <div style="font-size:13px;white-space:pre-wrap">${escapeHtml(display(booking.admin_notes))}</div>
          </div>
        </div>
      </div>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Lavista Bookings <onboarding@resend.dev>",
        to: [recipient],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Resend rejected the notification (${response.status}): ${errorBody.slice(0, 240)}`);
    }

    return { sent: true };
  });