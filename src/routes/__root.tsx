import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/lib/cart";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { useSessionKeeper } from "@/lib/session-keeper";
import { useAccount } from "@/lib/auth";
import { useNativePush } from "@/lib/native-push";
import { installGlobalErrorLogging, logAppError } from "@/lib/error-log";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة اللي تدور عليها مو موجودة أو انتقلت لمكان ثاني.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            الرجوع للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void logAppError(error, { kind: "boundary" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">ما تم تحميل الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          صارت مشكلة مؤقتة. جرّب مرة ثانية أو ارجع للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            حاول مرة ثانية
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "لبابك | خدماتك وطلباتك لبابك" },
      {
        name: "description",
        content:
          "منصة لبابك العراقية: مطاعم، متاجر، مندوب، توصيل خاص، تكسي، ومهن وخدمات بمكان واحد.",
      },
      { property: "og:title", content: "لبابك | خدماتك وطلباتك لبابك" },
      { property: "og:description", content: "كل خدماتك اليومية بمكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1b3a86" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "لبابك" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** تسجيل إشعارات الهاتف الأصلية بعد توفر جلسة المستخدم (داخل غلاف الموبايل فقط). */
function NativePushBridge() {
  const { data: account } = useAccount();
  useNativePush(account?.userId ?? null, {
    deepLink: (orderId) => (orderId ? `/orders/${orderId}` : "/notifications"),
  });
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // الحفاظ على جلسة المصادقة بعد إعادة فتح التطبيق
  useSessionKeeper();

  // تجميع أخطاء الواجهة في لوحة مراقبة الإدارة
  useEffect(() => installGlobalErrorLogging(), []);

  // تسجيل عامل الخدمة لتوفير صفحة بديلة عند انقطاع الاتصال (غلاف Capacitor والويب)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // لا نوقف التطبيق إذا فشل التسجيل
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <NativePushBridge />
      <ThemeProvider>
        <CartProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" richColors />
        </CartProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
