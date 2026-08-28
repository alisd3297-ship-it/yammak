import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Loader2, Mail, ShieldOff, ShieldCheck, Unlink } from "lucide-react";
import {
  createProviderAccount,
  getProviderAccount,
  resetProviderAccountPassword,
  setProviderAccountBlocked,
  unlinkProviderAccount,
} from "@/lib/provider-accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * إدارة حساب دخول مستقل لكل نشاط (مطعم/محل/مقدم خدمة).
 * الحساب يُربط بـ providers.owner_id ويأخذ دور «provider» فقط،
 * فلا يرى صاحبه أي نشاط آخر (تُطبّق القيود في قاعدة البيانات عبر RLS).
 */

const MODES = [
  { key: "password", label: "إنشاء بكلمة مرور" },
  { key: "invite", label: "دعوة بالبريد" },
] as const;

export function ProviderAccountDialog({
  open,
  onOpenChange,
  providerId,
  providerName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  providerId: string | null;
  providerName: string;
}) {
  const qc = useQueryClient();
  const fetchAccount = useServerFn(getProviderAccount);
  const create = useServerFn(createProviderAccount);
  const resetPassword = useServerFn(resetProviderAccountPassword);
  const setBlocked = useServerFn(setProviderAccountBlocked);
  const unlink = useServerFn(unlinkProviderAccount);

  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("password");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const account = useQuery({
    queryKey: ["provider-account", providerId],
    enabled: open && Boolean(providerId),
    queryFn: () => fetchAccount({ data: { providerId: providerId! } }),
  });

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setNewPassword("");
    setFullName(providerName);
    setMode("password");
  }, [open, providerName]);

  function refresh() {
    void account.refetch();
    void qc.invalidateQueries({ queryKey: ["admin-providers"] });
  }

  async function run(fn: () => Promise<unknown>, okMessage: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  const linked = account.data?.linked === true ? account.data : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle>حساب دخول النشاط</DialogTitle>
          <DialogDescription>
            {providerName} — حساب مستقل يدخل منه صاحب النشاط إلى لوحته فقط.
          </DialogDescription>
        </DialogHeader>

        {account.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : linked ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-muted/60 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Mail className="size-4" />
                {linked.email ?? "بدون بريد"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {linked.blocked ? "الحساب معطّل — لا يستطيع الدخول" : "الحساب فعّال"}
                {linked.invitePending ? " • دعوة بانتظار التفعيل" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                آخر دخول:{" "}
                {linked.lastSignInAt
                  ? new Date(linked.lastSignInAt).toLocaleString("ar-IQ")
                  : "لم يسجّل دخول بعد"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-new-pass">إعادة تعيين كلمة المرور</Label>
              <div className="flex gap-2">
                <Input
                  id="pa-new-pass"
                  type="text"
                  autoComplete="off"
                  placeholder="كلمة مرور جديدة (8 أحرف فأكثر)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  variant="outline"
                  className="h-11 shrink-0"
                  disabled={busy || newPassword.length < 8}
                  onClick={() =>
                    void run(
                      () =>
                        resetPassword({
                          data: { providerId: providerId!, password: newPassword },
                        }).then(() => setNewPassword("")),
                      "تم تحديث كلمة المرور",
                    )
                  }
                >
                  <KeyRound className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className={cn("h-10 flex-1", !linked.blocked && "text-destructive")}
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      setBlocked({ data: { providerId: providerId!, blocked: !linked.blocked } }),
                    linked.blocked ? "تم تفعيل الحساب" : "تم تعطيل الحساب",
                  )
                }
              >
                {linked.blocked ? (
                  <ShieldCheck className="size-4" />
                ) : (
                  <ShieldOff className="size-4" />
                )}
                {linked.blocked ? "تفعيل الحساب" : "تعطيل الحساب"}
              </Button>
              <Button
                variant="outline"
                className="h-10"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => unlink({ data: { providerId: providerId! } }),
                    "تم فك ارتباط الحساب",
                  )
                }
              >
                <Unlink className="size-4" />
                فك الارتباط
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition",
                    mode === m.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-name">اسم صاحب النشاط</Label>
              <Input id="pa-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-email">البريد الإلكتروني *</Label>
              <Input
                id="pa-email"
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {mode === "password" && (
              <div className="space-y-1.5">
                <Label htmlFor="pa-pass">كلمة المرور *</Label>
                <Input
                  id="pa-pass"
                  type="text"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="8 أحرف فأكثر"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  سلّم البيانات لصاحب النشاط وخلّيه يغيّرها بعد أول دخول.
                </p>
              </div>
            )}

            <Button
              className="h-11 w-full"
              disabled={busy || !email.trim() || (mode === "password" && password.length < 8)}
              onClick={() =>
                void run(
                  () =>
                    create({
                      data: {
                        providerId: providerId!,
                        email: email.trim(),
                        password: mode === "password" ? password : null,
                        fullName: fullName.trim() || providerName,
                        mode,
                        redirectTo:
                          typeof window !== "undefined" ? `${window.location.origin}/auth` : null,
                      },
                    }),
                  mode === "invite" ? "تم إرسال الدعوة" : "تم إنشاء الحساب وربطه بالنشاط",
                )
              }
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "invite" ? (
                "إرسال الدعوة"
              ) : (
                "إنشاء الحساب"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
