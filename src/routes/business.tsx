import { createFileRoute } from "@tanstack/react-router";
import { GroupAccountPage } from "@/components/group-account-page";
import { requireSignedIn } from "@/lib/route-guards";

export const Route = createFileRoute("/business")({
  ssr: false,
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "لبابك للأعمال | حسابات الشركات" },
      {
        name: "description",
        content: "حساب أعمال في لبابك: صلاحيات طلب للموظفين، حدود إنفاق شهرية، وفواتير موحّدة.",
      },
      { property: "og:title", content: "لبابك للأعمال | حسابات الشركات" },
      { property: "og:description", content: "طلبات شركتك بحساب واحد منظم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <GroupAccountPage kind="business" />,
});
