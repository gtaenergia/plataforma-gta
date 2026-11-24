import { Suspense } from "react";
import { ContasFixas } from "@/components/financeiro/ContasFixas";

export default function FinanceiroContasPage() {
  return (
    <Suspense>
      <ContasFixas />
    </Suspense>
  );
}
