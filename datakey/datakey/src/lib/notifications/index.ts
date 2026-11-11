/**
 * DataKey Notification Dispatcher
 * Dispatches real-time alerts to the owner via Telegram Bot and Resend email
 * whenever a finder transmits a message or location.
 */

export interface FinderNotificationPayload {
  token: string;
  message: string;
  finderContact?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  locationDenied: boolean;
  timestamp: string;
}

export async function notifyOwnerOfFinderTransmission(
  payload: FinderNotificationPayload
): Promise<{ telegram: boolean; email: boolean }> {
  const results = { telegram: false, email: false };

  // 1. Send Telegram Alert
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    try {
      const mapsUrl =
        payload.latitude && payload.longitude
          ? `https://www.google.com/maps?q=${payload.latitude},${payload.longitude}`
          : null;

      const telegramText =
        `🚨 *DATAKEY FINDER ALERT*\n\n` +
        `Keychain Token: \`${payload.token}\`\n` +
        `Time: ${payload.timestamp}\n\n` +
        `*Message from Finder:*\n"${payload.message}"\n\n` +
        `*Finder Contact:* ${payload.finderContact || "Not provided"}\n` +
        `*Location Status:* ${
          payload.locationDenied
            ? "Permission Denied by Finder"
            : mapsUrl
            ? `[View on Google Maps](${mapsUrl}) (Accuracy: ~${Math.round(payload.accuracyMeters || 0)}m)`
            : "No coordinates available"
        }`;

      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: telegramText,
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          }),
        }
      );

      results.telegram = res.ok;
    } catch (err) {
      console.error("Failed to send Telegram notification:", err);
    }
  }

  // 2. Send Resend Email Alert
  const resendApiKey = process.env.RESEND_API_KEY;
  const ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "alerts@datakey.app";

  if (resendApiKey && ownerEmail) {
    try {
      const mapsUrl =
        payload.latitude && payload.longitude
          ? `https://www.google.com/maps?q=${payload.latitude},${payload.longitude}`
          : null;

      const emailHtml = `
        <div style="font-family: sans-serif; background-color: #080808; color: #cdcbca; padding: 24px; border: 1px solid rgba(205,203,202,0.3); border-radius: 8px;">
          <h2 style="color: #cdcbca; border-bottom: 1px solid rgba(205,203,202,0.2); padding-bottom: 8px;">🚨 DataKey Finder Alert</h2>
          <p>Someone scanned your keychain token: <strong>${payload.token}</strong></p>
          <p><strong>Message:</strong></p>
          <blockquote style="background: rgba(205,203,202,0.08); padding: 12px; border-left: 3px solid #cdcbca;">
            ${payload.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </blockquote>
          <p><strong>Finder Contact:</strong> ${payload.finderContact ? payload.finderContact.replace(/</g, "&lt;") : "Not provided"}</p>
          <p><strong>Location:</strong> ${
            payload.locationDenied
              ? "Location permission was denied by the finder."
              : mapsUrl
              ? `<a href="${mapsUrl}" style="color: #cdcbca; text-decoration: underline;">View on Google Maps</a> (Accuracy: ~${Math.round(payload.accuracyMeters || 0)}m)`
              : "Not provided"
          }</p>
          <hr style="border: 0; border-top: 1px solid rgba(205,203,202,0.2); margin: 20px 0;" />
          <p style="font-size: 12px; color: rgba(205,203,202,0.6);">Automated notification from DataKey Vault.</p>
        </div>
      `;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: ownerEmail,
          subject: `[DataKey Alert] Finder Transmission for Token ${payload.token}`,
          html: emailHtml,
        }),
      });

      results.email = res.ok;
    } catch (err) {
      console.error("Failed to send Resend email alert:", err);
    }
  }

  return results;
}

