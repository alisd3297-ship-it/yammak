import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * تنبيه صوتي + مرئي للإشعارات المهمة (طلب جديد / تحديث حالة).
 * - الصوت مولّد عبر WebAudio (بلا ملفات) ويُفتح قفله عند أول لمسة من المستخدم
 *   احتراماً لسياسة المتصفح/الهاتف التي تمنع التشغيل التلقائي.
 * - مانع تكرار: لا يتكرر الصوت قبل مضي 6 ثوانٍ، ولا يعيد نفس الإشعار.
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;
let lastPlayed = 0;
const seen = new Set<string>();
/** أحدث المعرّفات فقط: يمنع تضخم الذاكرة في الجلسات الطويلة. */
function rememberSeen(id: string) {
  seen.add(id);
  if (seen.size > 300) {
    const it = seen.values();
    for (let i = 0; i < 100; i += 1) {
      const next = it.next();
      if (next.done) break;
      seen.delete(next.value);
    }
  }
}
let pendingSound: AlertKind | null = null;
/** آخر وقت تنبيه لكل طلب: يمنع تكرار النغمة لنفس الطلب. */
const lastByTag = new Map<string, number>();

const SOUND_PREF_KEY = "lubabak.alert-sound";

export function alertSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
}

export function setAlertSoundEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
}

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** يجب استدعاؤها مرة واحدة داخل تفاعل المستخدم لتفعيل الصوت على الهاتف. */
export function unlockAlertSound() {
  const ac = ctx();
  if (!ac) return;
  void ac.resume().then(() => {
    unlocked = true;
    // تنبيه وصل قبل تفاعل المستخدم: نشغّله الآن بعد فك القفل.
    if (pendingSound) {
      const kind = pendingSound;
      pendingSound = null;
      lastPlayed = 0;
      playAlertSound(kind);
    }
  });
}

/** نوع التنبيه: طلب جديد له نغمة أوضح وأطول من التحديثات العادية. */
export type AlertKind = "default" | "order";

/**
 * نمط النغمة: [إزاحة بالثواني، التردد، المدة].
 * - order: نغمة «طلب جديد» مميزة — جرس صاعد قصير (مي–صول#–سي–مي عالية)
 *   بجرس أوضح وأقوى، لا يشبه نغمة إشعارات النظام ولا يتجاوز ثانية واحدة.
 * - default: نقرتان هادئتان لبقية الإشعارات.
 */
const TONES: Record<AlertKind, Array<[number, number, number]>> = {
  default: [
    [0, 880, 0.2],
    [0.22, 1175, 0.24],
  ],
  order: [
    [0, 659.25, 0.16],
    [0.12, 830.61, 0.16],
    [0.24, 987.77, 0.2],
    [0.38, 1318.51, 0.42],
  ],
};

/** نغمة تنبيه قصيرة مع منع التكرار المزعج. */
export function playAlertSound(kind: AlertKind = "default") {
  if (!alertSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayed < (kind === "order" ? 4_000 : 6_000)) return;
  const ac = ctx();
  if (!ac) return;
  if (ac.state === "suspended") {
    void ac.resume();
    if (!unlocked) {
      pendingSound = kind;
      return; // المتصفح يمنع الصوت قبل تفاعل المستخدم
    }
  }
  lastPlayed = now;
  const start = ac.currentTime;
  const peak = kind === "order" ? 0.42 : 0.2;

  // مخرج مشترك بضاغط بسيط: صوت أوضح وأقوى بلا تشويش.
  const master = ac.createGain();
  master.gain.value = 1;
  const shaper = ac.createDynamicsCompressor?.();
  if (shaper) master.connect(shaper).connect(ac.destination);
  else master.connect(ac.destination);

  TONES[kind].forEach(([offset, freq, dur]) => {
    const t = start + offset;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    gain.connect(master);

    // أساس نقي + توافقية خفيفة تعطي رنّة «جرس» جميلة بدل صفير جاف
    const osc = ac.createOscillator();
    osc.type = kind === "order" ? "sine" : "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    if (kind === "order") {
      const harm = ac.createOscillator();
      const harmGain = ac.createGain();
      harm.type = "triangle";
      harm.frequency.value = freq * 2;
      harmGain.gain.setValueAtTime(0.0001, t);
      harmGain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.01);
      harmGain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
      harm.connect(harmGain).connect(master);
      harm.start(t);
      harm.stop(t + dur + 0.02);
    }
  });
}

function vibrate(kind: AlertKind = "default") {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(kind === "order" ? [90, 60, 90, 60, 220] : [110, 60, 110]);
    } catch {
      // بعض المتصفحات تمنع الاهتزاز
    }
  }
}

export function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

/** تنبيه كامل: صوت + toast + إشعار نظام (إن سمح المستخدم). */
export function fireAlert(opts: {
  title: string;
  body?: string;
  tag?: string | null;
  url?: string | null;
  kind?: AlertKind;
}) {
  const { title, body = "", tag = null, url = null } = opts;
  const kind: AlertKind = opts.kind ?? (tag ? "order" : "default");
  // لا نكرر نغمة نفس الطلب خلال 30 ثانية حتى لا يكون التنبيه مزعجاً
  const now = Date.now();
  let silent = false;
  if (tag) {
    const prev = lastByTag.get(tag) ?? 0;
    if (now - prev < 30_000) silent = true;
    lastByTag.set(tag, now);
    if (lastByTag.size > 200) lastByTag.clear();
  }
  toast.info(title, { description: body || undefined });
  if (!silent) {
    playAlertSound(kind);
    vibrate(kind);
  }
  try {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const n = new Notification(title, {
        body: body || title,
        icon: "/icon-192.png",
        ...(tag ? { tag } : {}),
      });
      n.onclick = () => {
        window.focus();
        if (url) window.location.assign(url);
      };
    }
  } catch {
    // التنبيه داخل التطبيق يكفي
  }
}

/**
 * الاشتراك اللحظي بإشعارات المستخدم مع تنبيه صوتي ومرئي.
 * يفتح قفل الصوت عند أول تفاعل من المستخدم في الصفحة.
 */
export function useAlertNotifications(
  userId: string | null,
  opts?: { deepLink?: (orderId: string | null) => string | null; onInsert?: () => void },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => unlockAlertSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    requestNotificationPermission();

    const channel = supabase
      .channel(`alerts-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            title: string;
            body: string | null;
            kind: string | null;
            order_id: string | null;
          };
          if (seen.has(row.id)) return;
          rememberSeen(row.id);
          const isTrip = (row.kind ?? "").startsWith("trip");
          fireAlert({
            title: row.title,
            body: row.body ?? "",
            tag: row.order_id ?? (isTrip ? row.id : null),
            kind: row.order_id || isTrip ? "order" : "default",
            url: optsRef.current?.deepLink?.(row.order_id ?? null) ?? null,
          });
          optsRef.current?.onInsert?.();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
