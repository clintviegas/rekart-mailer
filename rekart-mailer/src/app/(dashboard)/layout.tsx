import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { SellStaffActionAlerts } from "@/components/sell/sell-staff-action-alerts";
import { RepairStaffActionAlerts } from "@/components/repair/repair-staff-action-alerts";
import { RentStaffActionAlerts } from "@/components/rent/rent-staff-action-alerts";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout>
      <SellStaffActionAlerts />
      <RepairStaffActionAlerts />
      <RentStaffActionAlerts />
      {children}
    </DashboardLayout>
  );
}
