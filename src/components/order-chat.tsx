import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Message = { id: string; body: string; sender_id: string; created_at: string };

/**
 * محادثة داخل الطلب بين الزبون والمندوب/التاجر.
 * الصلاحيات محكومة بـ RLS (can_see_order) والرسائل تصل لحظياً عبر Realtime.
 */
export function OrderChat({ orderId, disabled }: { orderId: string; disabled?: boolean }) {
  const { data: account } = useAccount();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ["order-messages", orderId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_messages")
        .select("id, body, sender_id, created_at")
        .eq("order_id", orderId)
        .order("created_at")
        .limit(200);
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`order-messages-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_messages",
          filter: `order_id=eq.${orderId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["order-messages", orderId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, qc]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages?.length]);

  async function send() {
    const body = text.trim();
    if (!body || !account?.userId || sending) return;
    setSending(true);
    const { error } = await supabase
      .from("order_messages")
      .insert({ order_id: orderId, sender_id: account.userId, body: body.slice(0, 800) });
    setSending(false);
    if (!error) {
      setText("");
      void qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
    }
  }

  return (
    <section className="rounded-2xl bg-card p-4 shadow-soft">
      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <MessagesSquare className="size-4 text-primary" /> محادثة الطلب
      </h2>
      <div ref={listRef} className="max-h-56 space-y-2 overflow-y-auto">
        {(messages ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد رسائل بعد. اكتب أول رسالة.</p>
        )}
        {(messages ?? []).map((m) => {
          const mine = m.sender_id === account?.userId;
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-start" : "justify-end")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <span className="mt-1 block text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleTimeString("ar-IQ-u-nu-latn", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="mt-3 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="اكتب رسالتك…"
            className="h-11"
            aria-label="رسالة"
          />
          <Button className="h-11 px-4" onClick={() => void send()} disabled={sending}>
            <Send className="size-4" />
          </Button>
        </div>
      )}
      {disabled && (
        <p className="mt-3 text-xs text-muted-foreground">انتهى الطلب، المحادثة للقراءة فقط.</p>
      )}
    </section>
  );
}
