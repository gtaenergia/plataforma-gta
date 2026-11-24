import { Suspense } from "react";
import { DiaADia } from "@/components/financeiro/DiaADia";

export default function FinanceiroDiaADiaPage() {
  return (
    <Suspense>
      <DiaADia />
    </Suspense>
  );
}
