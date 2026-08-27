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
let pendingSound = false;

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
      pendingSound = false;
      lastPlayed = 0;
      playAlertSound();
    }
  });
}

/** نغمة تنبيه قصيرة (نقرتان) مع منع التكرار المزعج. */
export function playAlertSound() {
  if (!alertSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayed < 6_000) return;
  const ac = ctx();
  if (!ac) return;
  if (ac.state === "suspended") {
    void ac.resume();
    if (!unlocked) {
      pendingSound = true;
      return; // المتصفح يمنع الصوت قبل تفاعل المستخدم
    }
  }
  lastPlayed = now;
  const start = ac.currentTime;
  [0, 0.28].forEach((offset, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = i === 0 ? 880 : 1175;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
    osc.connect(gain).connect(ac.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.24);
  });
}

function vibrate() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate([120, 60, 120]);
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
export function fireAlert(opts: { title: string; body?: string; tag?: string | null; url?: string | null }) {
  const { title, body = "", tag = null, url = null } = opts;
  toast.info(title, { description: body || undefined });
  playAlertSound();
  vibrate();
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
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
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            title: string;
            body: string | null;
            order_id: string | null;
          };
          if (seen.has(row.id)) return;
          rememberSeen(row.id);
          fireAlert({
            title: row.title,
            body: row.body ?? "",
            tag: row.order_id,
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
