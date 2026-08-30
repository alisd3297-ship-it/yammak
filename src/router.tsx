import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { installQueryPerfMonitor } from "./lib/perf";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // البيانات اللحظية تعتمد على refetchInterval/Realtime وتتجاوز هذه القيمة،
        // بينما تمنع هذه الإعدادات إعادة الجلب المكررة عند كل تنقل بين الصفحات.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  // مراقبة خفيفة لأزمنة الاستعلامات (محلية فقط، بلا خدمة خارجية).
  installQueryPerfMonitor(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // ينقل بيانات الاستعلامات المنفَّذة على الخادم إلى المتصفح حتى لا يختلف الرسم بعد التحميل.
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
