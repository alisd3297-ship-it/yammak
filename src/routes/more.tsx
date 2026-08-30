import { createFileRoute, Link } from "@tanstack/react-router";
import * as Icons from "lucide-react";
import { BottomNav, BrandHeader, PageShell } from "@/components/app-shell";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/more")({
  head: () => ({
    meta: [
      { title: "المزيد | لبابك" },
      {
        name: "description",
        content: "كل خدمات لبابك: السلة، المحفظة، السوق، عروض الأسعار، الخريطة، الضمان والمزيد.",
      },
      { property: "og:title", content: "المزيد | لبابك" },
      { property: "og:description", content: "كل أدوات وخدمات لبابك بمكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MorePage,
});

type Item = {
  to:
    | "/checkout"
    | "/wallet"
    | "/payments"
    | "/marketplace"
    | "/quotes"
    | "/map"
    | "/nearby"
    | "/assistant"
    | "/request-anything"
    | "/special-delivery"
    | "/courier"
    | "/taxi"
    | "/service-requests"
    | "/ads"
    | "/plus"
    | "/referrals"
    | "/guarantee"
    | "/family"
    | "/business"
    | "/notifications"
    | "/join/provider"
    | "/join/driver";
  label: string;
  icon: Icons.LucideIcon;
  tone: "primary" | "amber" | "orange" | "green" | "purple";
};

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "طلباتي وأموالي",
    items: [
      { to: "/checkout", label: "السلة", icon: Icons.ShoppingCart, tone: "primary" },
      { to: "/wallet", label: "المحفظة", icon: Icons.Wallet, tone: "green" },
      { to: "/payments", label: "المدفوعات", icon: Icons.CreditCard, tone: "purple" },
      { to: "/notifications", label: "الإشعارات", icon: Icons.Bell, tone: "amber" },
    ],
  },
  {
    title: "خدمات لبابك",
    items: [
      { to: "/request-anything", label: "اطلب أي شي", icon: Icons.Sparkles, tone: "primary" },
      { to: "/assistant", label: "مساعد لبابك", icon: Icons.Bot, tone: "purple" },
      { to: "/nearby", label: "قريب منك", icon: Icons.MapPin, tone: "orange" },
      { to: "/map", label: "خريطة الخدمات", icon: Icons.Map, tone: "green" },
      { to: "/marketplace", label: "سوق لبابك", icon: Icons.ShoppingBag, tone: "amber" },
      { to: "/quotes", label: "عروض الأسعار", icon: Icons.MessagesSquare, tone: "primary" },
      { to: "/courier", label: "مندوب توصيل", icon: Icons.Bike, tone: "orange" },
      { to: "/special-delivery", label: "توصيل خاص", icon: Icons.PackageCheck, tone: "purple" },
      { to: "/taxi", label: "تكسي", icon: Icons.Car, tone: "amber" },
      { to: "/service-requests", label: "طلبات الخدمة", icon: Icons.ClipboardList, tone: "green" },
    ],
  },
  {
    title: "مزايا وحسابات",
    items: [
      { to: "/plus", label: "لبابك بلس", icon: Icons.Crown, tone: "amber" },
      { to: "/referrals", label: "الإحالات", icon: Icons.Gift, tone: "purple" },
      { to: "/guarantee", label: "ضمان لبابك", icon: Icons.ShieldCheck, tone: "green" },
      { to: "/family", label: "حساب العائلة", icon: Icons.Users, tone: "primary" },
      { to: "/business", label: "حساب الأعمال", icon: Icons.Briefcase, tone: "orange" },
      { to: "/ads", label: "أعلن معنا", icon: Icons.Megaphone, tone: "amber" },
      { to: "/join/provider", label: "سجّل نشاطك", icon: Icons.Store, tone: "primary" },
      { to: "/join/driver", label: "اشتغل مندوب", icon: Icons.Bike, tone: "green" },
    ],
  },
];

const TONES: Record<Item["tone"], string> = {
  primary: "bg-accent text-accent-foreground",
  amber: "bg-brand-amber/20 text-brand-amber-foreground",
  orange: "bg-brand-orange/20 text-brand-orange",
  green: "bg-brand-green/20 text-brand-green",
  purple: "bg-brand-purple/20 text-brand-purple",
};

function MorePage() {
  const { totalCount } = useCart();
  return (
    <PageShell>
      <BrandHeader subtitle="المزيد من لبابك" />
      <div className="space-y-6 px-4 pt-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-base font-bold">{g.title}</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {g.items.map((it) => (
                <Link
                  key={it.to + it.label}
                  to={it.to}
                  className="relative flex flex-col items-center gap-2 rounded-2xl bg-card p-3 text-center shadow-soft transition active:scale-95"
                >
                  <span
                    className={`flex size-11 items-center justify-center rounded-2xl ${TONES[it.tone]}`}
                  >
                    <it.icon className="size-5" />
                  </span>
                  <span className="text-[11px] font-bold leading-tight">{it.label}</span>
                  {it.to === "/checkout" && totalCount ? (
                    <span className="absolute end-2 top-2 min-w-5 rounded-full bg-primary px-1 text-[10px] font-bold leading-5 text-primary-foreground">
                      {totalCount}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <BottomNav />
    </PageShell>
  );
}
