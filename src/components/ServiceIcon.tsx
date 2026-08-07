import {
  Sun,
  Zap,
  HardHat,
  PlugZap,
  UtilityPole,
  CloudLightning,
  ClipboardCheck,
  Gauge,
  BatteryCharging,
  PanelsTopLeft,
  PencilRuler,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Ícones profissionais (line icons da Lucide) por serviço — substituem os emojis
 * dos cards. Herdam `currentColor`, então acompanham a cor do texto e funcionam
 * em claro/escuro. Componente puro (sem hooks): serve em server e client components.
 */

const MAP: Record<string, LucideIcon> = {
  solar: Sun,
  "projeto-subestacao": Zap,
  "execucao-subestacao": HardHat,
  conexao: PlugZap,
  "rede-mt": UtilityPole,
  spda: CloudLightning,
  "laudo-inspecao": ClipboardCheck,
  analisador: Gauge,
  carregador: BatteryCharging,
  qgbt: PanelsTopLeft,
  "projeto-bt": PencilRuler,
  "mao-de-obra": Users,
  limpeza: Sparkles,
};

export function ServiceIcon({ serviceKey, className = "h-6 w-6" }: { serviceKey: string; className?: string }) {
  const Comp = MAP[serviceKey] ?? Wrench;
  return <Comp className={className} strokeWidth={1.75} aria-hidden />;
}
