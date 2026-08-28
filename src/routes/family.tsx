import { createFileRoute } from "@tanstack/react-router";
import { GroupAccountPage } from "@/components/group-account-page";
import { requireSignedIn } from "@/lib/route-guards";

export const Route = createFileRoute("/family")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "حساب العائلة | لبابك" },
      {
        name: "description",
        content: "أنشئ حساب عائلة في لبابك، أضف أفراد العائلة، وحدد صلاحية الطلب وحد الإنفاق الشهري.",
      },
      { property: "og:title", content: "حساب العائلة | لبابك" },
      { property: "og:description", content: "طلبات العائلة بحساب واحد وحدود إنفاق واضحة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <GroupAccountPage kind="family" />,
});
