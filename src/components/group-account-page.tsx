import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, Building2, Trash2, ShieldCheck } from "lucide-react";
import { BackButton, BottomNav, PageShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIQD } from "@/lib/orders";
import {
  addGroupMember,
  createGroupAccount,
  getGroupAccount,
  updateGroupMember,
  type GroupKind,
} from "@/lib/accounts.functions";

const COPY: Record<GroupKind, { title: string; subtitle: string; memberLabel: string }> = {
  family: {
    title: "حساب العائلة",
    subtitle: "طلبات العائلة بحساب واحد مع حدود إنفاق لكل فرد",
    memberLabel: "اسم الفرد",
  },
  business: {
    title: "لبابك للأعمال",
    subtitle: "حساب شركة بفواتير موحّدة وصلاحيات طلب للموظفين",
    memberLabel: "الوظيفة أو القسم",
  },
};

export function GroupAccountPage({ kind }: { kind: GroupKind }) {
  const qc = useQueryClient();
  const copy = COPY[kind];
  const getFn = useServerFn(getGroupAccount);
  const createFn = useServerFn(createGroupAccount);
  const addFn = useServerFn(addGroupMember);
  const updateFn = useServerFn(updateGroupMember);

  const { data: account, isLoading } = useQuery({
    queryKey: ["group-account", kind],
    queryFn: () => getFn({ data: { kind } }),
  });

  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [phone, setPhone] = useState("");
  const [memberLabel, setMemberLabel] = useState("");
  const [memberLimit, setMemberLimit] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["group-account", kind] });

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      await createFn({ data: { kind, name, monthlyLimit: limit ? Number(limit) : 0 } });
      toast.success("تم إنشاء الحساب");
      setName("");
      setLimit("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإنشاء");
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (busy || !account) return;
    setBusy(true);
    try {
      const res = await addFn({
        data: {
          kind,
          accountId: account.id,
          phone,
          label: memberLabel,
          monthlyLimit: memberLimit ? Number(memberLimit) : 0,
        },
      });
      toast.success(`تمت إضافة ${res.name}`);
      setPhone("");
      setMemberLabel("");
      setMemberLimit("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إضافة العضو");
    } finally {
      setBusy(false);
    }
  }

  async function patchMember(memberId: string, patch: { canOrder?: boolean; remove?: boolean }) {
    try {
      await updateFn({ data: { kind, memberId, ...patch } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التحديث");
    }
  }

  const Icon = kind === "family" ? Users : Building2;

  return (
    <PageShell>
      <header className="brand-gradient rounded-b-3xl px-5 pb-8 pt-7 text-primary-foreground">
        <BackButton fallback="/account" />
        <h1 className="flex items-center gap-2 text-2xl font-black">
          <Icon className="size-6" /> {copy.title}
        </h1>
        <p className="mt-1 text-sm opacity-90">{copy.subtitle}</p>
      </header>

      <div className="space-y-5 px-4 py-5">
        {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل…</p>}

        {!isLoading && !account && (
          <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="font-bold">إنشاء الحساب</h2>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
              placeholder={kind === "family" ? "اسم العائلة" : "اسم الشركة"}
              aria-label="اسم الحساب"
            />
            <Input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="h-11"
              type="number"
              min={0}
              placeholder="حد الإنفاق الشهري بالدينار (0 = بلا حد)"
              aria-label="حد الإنفاق الشهري"
            />
            <Button className="h-12 w-full" disabled={busy} onClick={() => void create()}>
              إنشاء الحساب
            </Button>
          </section>
        )}

        {account && (
          <>
            <section className="rounded-2xl bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{account.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    حد الإنفاق الشهري:{" "}
                    {account.monthlyLimit > 0 ? formatIQD(account.monthlyLimit) : "بلا حد"}
                  </p>
                </div>
                {account.isOwner && (
                  <span className="flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success">
                    <ShieldCheck className="size-3" /> مالك الحساب
                  </span>
                )}
              </div>
            </section>

            {account.isOwner && (
              <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
                <h2 className="font-bold">إضافة عضو</h2>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11"
                  inputMode="tel"
                  placeholder="رقم هاتف العضو المسجّل في لبابك"
                  aria-label="رقم الهاتف"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={memberLabel}
                    onChange={(e) => setMemberLabel(e.target.value)}
                    className="h-11"
                    placeholder={copy.memberLabel}
                    aria-label={copy.memberLabel}
                  />
                  <Input
                    value={memberLimit}
                    onChange={(e) => setMemberLimit(e.target.value)}
                    className="h-11"
                    type="number"
                    min={0}
                    placeholder="حد شهري"
                    aria-label="حد العضو الشهري"
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={busy}
                  onClick={() => void addMember()}
                >
                  إضافة
                </Button>
              </section>
            )}

            <section>
              <h2 className="mb-3 text-base font-bold">الأعضاء</h2>
              <div className="space-y-2">
                {account.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-card p-3 shadow-soft"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.canOrder ? "يقدر يطلب" : "بدون صلاحية طلب"} ·{" "}
                        {m.monthlyLimit > 0 ? formatIQD(m.monthlyLimit) : "بلا حد"}
                      </p>
                    </div>
                    {account.isOwner && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          className="h-9 px-3 text-xs"
                          onClick={() => void patchMember(m.id, { canOrder: !m.canOrder })}
                        >
                          {m.canOrder ? "إيقاف الطلب" : "تفعيل الطلب"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-9 px-2"
                          aria-label="حذف العضو"
                          onClick={() => void patchMember(m.id, { remove: true })}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {!account.members.length && (
                  <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
                    ماكو أعضاء بعد.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
