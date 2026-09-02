/**
 * جسر الغلاف الأصلي (Capacitor) لتطبيق «لبابك».
 *
 * كل الدوال هنا آمنة على الويب: إذا لم نكن داخل تطبيق أصلي فلا تفعل شيئاً
 * (أو تعود للسلوك الافتراضي للمتصفح)، لذلك لا تتأثر أي وظيفة موجودة.
 */

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** فتح رابط خارجي بمتصفح داخل التطبيق (بدل ترك WebView يخرج من التطبيق). */
export async function openExternalLink(url: string): Promise<void> {
  if (!isNativePlatform()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * طلب صلاحية الموقع داخل أندرويد/iOS قبل استخدام navigator.geolocation.
 * على الويب نرجع true ونترك المتصفح يطلب الإذن كالمعتاد.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const current = await Geolocation.checkPermissions();
    if (current.location === "granted" || current.coarseLocation === "granted") return true;
    const asked = await Geolocation.requestPermissions({ permissions: ["location"] });
    return asked.location === "granted" || asked.coarseLocation === "granted";
  } catch {
    return true;
  }
}

const EXTERNAL_SCHEMES = ["tel:", "mailto:", "sms:", "whatsapp:", "geo:"];

function isInternalUrl(url: URL): boolean {
  if (typeof window === "undefined") return true;
  if (url.origin === window.location.origin) return true;
  return url.hostname.endsWith("lovable.app");
}

/**
 * تهيئة الغلاف الأصلي: شريط الحالة، إخفاء شاشة البداية، زر الرجوع،
 * واعتراض الروابط الخارجية لفتحها بمتصفح داخل التطبيق.
 * تُستدعى مرة واحدة من الجذر وتُرجع دالة تنظيف.
 */
export function initNativeShell(): () => void {
  if (!isNativePlatform()) return () => {};
  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#5c2018" });
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {
      // شريط الحالة غير متاح على بعض المنصات
    }
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide();
    } catch {
      // لا شيء
    }
    try {
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      cleanups.push(() => void handle.remove());
    } catch {
      // لا شيء
    }
  })();

  // اعتراض الروابط الخارجية
  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (EXTERNAL_SCHEMES.some((scheme) => href.startsWith(scheme))) return; // يتكفل بها النظام
    if (!/^https?:\/\//i.test(href)) return;
    let url: URL;
    try {
      url = new URL(href, window.location.href);
    } catch {
      return;
    }
    if (isInternalUrl(url)) return;
    event.preventDefault();
    void openExternalLink(url.toString());
  };
  document.addEventListener("click", onClick);
  cleanups.push(() => document.removeEventListener("click", onClick));

  return () => cleanups.forEach((fn) => fn());
}
