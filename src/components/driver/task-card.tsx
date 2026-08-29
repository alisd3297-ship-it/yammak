import { Check, MapPin, PackageCheck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriverMap } from "@/components/driver/driver-map";
import { OrderChat } from "@/components/order-chat";
import { formatIQD } from "@/lib/orders";
import { vehicleLabel } from "@/lib/vehicles";
import { cn } from "@/lib/utils";
import {
  SIMPLE_STAGE_LABELS,
  SIMPLE_STAGE_ORDER,
  simpleNextAction,
  simpleStageOf,
} from "@/lib/driver-flow";
import type { DriverTask } from "@/lib/driver-data";
import type { OrderStatus } from "@/lib/orders";

/** بطاقة المهمة الحالية: تدفق مختصر (قبول → جاهز → تم التسليم) بزر إجراء واحد. */
export function TaskCard({
  task,
  onAdvance,
  onCompleteStop,
}: {
  task: DriverTask;
  onAdvance: (orderId: string, chain: OrderStatus[]) => void;
  onCompleteStop: (stopId: string) => void;
}) {
  const stage = simpleStageOf(task.status);
  const action = simpleNextAction(task.status);
  const currentIndex = SIMPLE_STAGE_ORDER.indexOf(stage);
  const target = currentIndex >= 1 ? "dropoff" : "pickup";
  const stops = [...(task.order_stops ?? [])].sort((a, b) => a.position - b.position);

  return (
    <article className="rounded-3xl border border-primary/30 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black">طلب #{task.code}</p>
          <p className="mt-1 text-xs font-bold text-primary">{SIMPLE_STAGE_LABELS[stage]}</p>
        </div>
        <div className="text-end">
          <p className="text-xl font-black text-primary">
            {formatIQD(Number(task.delivery_fee ?? 0) || Number(task.total))}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {task.delivery_fee ? "أجر التوصيل" : "قيمة الطلب"}
          </p>
        </div>
      </div>

      <ol className="mt-4 flex items-center gap-2">
        {SIMPLE_STAGE_ORDER.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-full rounded-full",
                i <= currentIndex ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "text-[10px] font-semibold leading-tight",
                i <= currentIndex ? "text-primary" : "text-muted-foreground",
              )}
            >
              {SIMPLE_STAGE_LABELS[s]}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-2 rounded-2xl bg-muted/60 p-3 text-sm">
        <p className="flex items-start gap-2">
          <PackageCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="font-semibold">{task.pickup_text ?? "نقطة الاستلام غير محددة"}</span>
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="font-semibold">{task.dropoff_text ?? "نقطة التسليم غير محددة"}</span>
        </p>
        {task.vehicle_type && (
          <p className="text-xs font-semibold text-primary">
            المركبة: {vehicleLabel(task.vehicle_type)}
          </p>
        )}
        {task.notes && <p className="text-xs text-muted-foreground">ملاحظات: {task.notes}</p>}
      </div>

      <DriverMap
        pickup={
          task.pickup_lat != null && task.pickup_lng != null
            ? { lat: task.pickup_lat, lng: task.pickup_lng, label: "الاستلام" }
            : null
        }
        dropoff={
          task.dropoff_lat != null && task.dropoff_lng != null
            ? { lat: task.dropoff_lat, lng: task.dropoff_lng, label: "الزبون" }
            : null
        }
        target={target}
      />

      {!!stops.length && (
        <ul className="mt-3 space-y-2">
          {stops.map((s, i) => (
            <li key={s.id} className="rounded-2xl bg-muted/60 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">النقطة {i + 1}</span>
                {s.is_delivered ? (
                  <span className="flex items-center gap-1 font-bold text-success">
                    <Check className="size-3.5" /> تم التسليم
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => onCompleteStop(s.id)}
                  >
                    تم التسليم
                  </Button>
                )}
              </div>
              <p className="mt-1">{s.address_text}</p>
              {s.recipient_phone && (
                <a
                  href={`tel:${s.recipient_phone}`}
                  className="mt-1 inline-flex items-center gap-1 text-primary"
                >
                  <Phone className="size-3.5" /> {s.recipient_name ?? "اتصال بالمستلم"} ·{" "}
                  {s.recipient_phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {action && (
        <Button
          className="mt-4 h-16 w-full rounded-2xl text-base font-black"
          onClick={() => onAdvance(task.id, action.chain)}
        >
          {action.label}
        </Button>
      )}

      <div className="mt-4">
        <OrderChat orderId={task.id} />
      </div>
    </article>
  );
}
