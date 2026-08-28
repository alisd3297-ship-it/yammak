/**
 * إرسال إشعارات الهاتف عبر FCM HTTP v1.
 * يتطلب سرّين خارجيين: FCM_PROJECT_ID و FCM_SERVICE_ACCOUNT_JSON.
 * بدونهما لا يُرسل شيء ويُرجع سبباً واضحاً (لا ادعاء بالعمل).
 */

type ServiceAccount = { client_email: string; private_key: string };

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`fcm_token_failed_${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("fcm_token_missing");
  return json.access_token;
}

export type PushMessage = {
  title: string;
  body: string;
  orderId?: string | null;
  kind?: string | null;
};

/** إرسال رسالة لعدة رموز أجهزة. يُرجع الرموز غير الصالحة لتعطيلها. */
export async function sendFcm(
  tokens: readonly string[],
  msg: PushMessage,
): Promise<{ sent: number; invalid: string[]; reason?: string }> {
  const projectId = process.env["FCM_PROJECT_ID"];
  const saRaw = process.env["FCM_SERVICE_ACCOUNT_JSON"];
  if (!projectId || !saRaw) return { sent: 0, invalid: [], reason: "fcm_not_configured" };
  if (tokens.length === 0) return { sent: 0, invalid: [] };

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(saRaw) as ServiceAccount;
  } catch {
    return { sent: 0, invalid: [], reason: "fcm_service_account_invalid" };
  }

  const token = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const invalid: string[] = [];
  let sent = 0;

  for (const deviceToken of tokens) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: msg.title, body: msg.body },
          data: {
            orderId: msg.orderId ?? "",
            kind: msg.kind ?? "",
          },
          android: {
            priority: "HIGH",
            notification: {
              channel_id: androidChannelId(msg),
              sound: "default",
              default_vibrate_timings: true,
              default_light_settings: true,
              notification_priority: "PRIORITY_MAX",
              visibility: "PUBLIC",
            },
          },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", badge: 1 } },
          },
        },
      }),
    });
    if (res.ok) sent += 1;
    else if (res.status === 404 || res.status === 400) invalid.push(deviceToken);
  }

  return { sent, invalid };
}
