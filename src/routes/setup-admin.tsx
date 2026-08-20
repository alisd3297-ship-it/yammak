import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { claimSuperAdmin, superAdminExists } from "@/lib/admin-setup.functions";
import { useAccount } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/setup-admin")({
  head: () => ({
    meta: [
      { title: "إعداد المدير العام | يمّك" },
      { name: "description", content: "مسار إعداد لمرة واحدة لمنح صلاحية المدير العام لمالك المشروع." },
      { property: "og:title", content: "إعداد المدير العام | يمّك" },
      { property: "og:description", content: "منح صلاحية الإدارة لأول مرة برمز إعداد سري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupAdminPage,
});

function SetupAdminPage() {
  const navigate = useNavigate();
  const { data: account, refetch } = useAccount();
  const check = useServerFn(superAdminExists);
  const claim = useServerFn(claimSuperAdmin);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: status } = useQuery({ queryKey: ["super-admin-exists"], queryFn: () => check({}) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await claim({ data: { token } });
      if (!res.ok) {
        toast.error(
          res.reason === "already_configured"
            ? "يوجد مدير عام مسبقاً، لا يمكن استخدام هذا المسار"
            : "رمز الإعداد غير صحيح",
        );
        return;
      }
      toast.success("تم منحك صلاحية المدير العام");
      await refetch();
      navigate({ to: "/admin/providers" });
    } catch {
      toast.error("تعذر إكمال الإعداد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell flex flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-black text-primary">إعداد المدير العام</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        هذا المسار يعمل مرة واحدة فقط: يمنح صلاحية «مدير عام» للحساب المسجل دخوله حالياً بعد إدخال رمز الإعداد
        السري المخزّن في إعدادات المشروع.
      </p>

      {!account?.userId ? (
        <div className="mt-6 rounded-2xl bg-card p-5 text-sm shadow-card">
          سجّل الدخول أولاً بالحساب الذي تريد أن يكون مدير عام.
          <Link to="/auth" className="mt-3 block font-semibold text-primary">
            الذهاب لتسجيل الدخول
          </Link>
        </div>
      ) : status?.exists ? (
        <div className="mt-6 rounded-2xl bg-card p-5 text-sm shadow-card">
          تم إعداد المدير العام مسبقاً. هذا المسار معطّل الآن.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl bg-card p-5 shadow-card">
          <div className="space-y-2">
            <Label htmlFor="token">رمز الإعداد</Label>
            <Input
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
            منحي صلاحية المدير العام
          </Button>
        </form>
      )}
    </div>
  );
}
