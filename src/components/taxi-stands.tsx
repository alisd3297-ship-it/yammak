import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CarTaxiFront, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/lib/auth";
import { distanceKm } from "@/lib/orders";

export type TaxiStand = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  waiting: number;
  km: number | null;
};

/** مواقف التكسي مع عدد السائقين المنتظرين في كل موقف، مرتبة حسب القرب. */
export function useTaxiStands(coords?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ["taxi-stands", coords?.lat ?? null, coords?.lng ?? null],
    refetchInterval: 60_000,
    queryFn: async (): Promise<TaxiStand[]> => {
      const { data: stands } = await supabase
        .from("taxi_stands")
        .select("id, name, lat, lng, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      // عدّ المنتظرين عبر دالة مجمّعة: لا تكشف هوية أي سائق
      const { data: queue } = await supabase.rpc("taxi_stand_waiting_counts");

      const counts = new Map<string, number>();
      for (const row of queue ?? []) counts.set(row.stand_id, row.waiting ?? 0);

      const rows = (stands ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        waiting: counts.get(s.id) ?? 0,
        km:
          coords && s.lat != null && s.lng != null
            ? distanceKm(coords.lat, coords.lng, s.lat, s.lng)
            : null,
      }));
      return rows.sort((a, b) => (a.km ?? 99) - (b.km ?? 99));
    },
  });
}

/** بطاقة للزبون تعرض المواقف القريبة وعدد سيارات التكسي المنتظرة فيها. */
export function TaxiStandsBoard({ coords }: { coords?: { lat: number; lng: number } | null }) {
  const { data } = useTaxiStands(coords);
  if (!data?.length) return null;
  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm font-bold">
        <CarTaxiFront className="size-5 text-primary" /> طوابير التكسي القريبة
      </p>
      <div className="mt-3 space-y-2">
        {data.slice(0, 4).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold">{s.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
              {s.km != null && <span>{s.km.toFixed(1)} كم</span>}
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-bold">
                <Users className="size-3.5" /> {s.waiting}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** لوحة السائق: الدخول والخروج من طابور موقف. */
export function DriverStandQueue() {
  const qc = useQueryClient();
  const { data: account } = useAccount();
  const { data: stands } = useTaxiStands(null);

  const { data: mine } = useQuery({
    queryKey: ["my-stand-queue", account?.userId],
    enabled: !!account?.userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("taxi_stand_queue")
        .select("id, stand_id, joined_at")
        .eq("driver_id", account!.userId!)
        .is("left_at", null)
        .maybeSingle();
      return data;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["taxi-stands"] });
    void qc.invalidateQueries({ queryKey: ["my-stand-queue"] });
  };

  async function join(standId: string) {
    if (!account?.userId) return;
    const { error } = await supabase
      .from("taxi_stand_queue")
      .insert({ stand_id: standId, driver_id: account.userId });
    if (error) toast.error("تعذر الدخول للطابور");
    else {
      toast.success("دخلت الطابور");
      refresh();
    }
  }

  async function leave(id: string) {
    const { error } = await supabase
      .from("taxi_stand_queue")
      .update({ left_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("تعذر الخروج من الطابور");
    else {
      toast.success("خرجت من الطابور");
      refresh();
    }
  }

  if (!stands?.length) return null;

  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm font-bold">
        <CarTaxiFront className="size-5 text-primary" /> طوابير المواقف
      </p>
      <div className="mt-3 space-y-2">
        {stands.map((s) => {
          const active = mine?.stand_id === s.id;
          return (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.waiting} سائق بالانتظار</p>
              </div>
              {active ? (
                <Button
                  variant="outline"
                  className="h-9 shrink-0 px-3 text-xs"
                  onClick={() => void leave(mine!.id)}
                >
                  اخرج
                </Button>
              ) : (
                <Button
                  className="h-9 shrink-0 px-3 text-xs"
                  disabled={!!mine}
                  onClick={() => void join(s.id)}
                >
                  ادخل الطابور
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
