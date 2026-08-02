import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, XCircle } from "lucide-react";

/**
 * Primitivos de UI compartilhados da Plataforma GTA. Encapsulam o "acabamento"
 * (espaçamento, tipografia, cores, dark mode) para que as telas fiquem
 * consistentes sem repetir strings de Tailwind. As classes puras de estilo
 * (.card, .section-card, .subcard, .badge, .btn-*, .data-table) ficam em
 * globals.css; aqui estão os componentes com estrutura/lógica.
 */

/**
 * Foto de perfil (ou círculo com a inicial do nome quando não há foto).
 * `tone="header"` = fundo translúcido branco (usado sobre o navy do cabeçalho);
 * `tone="solid"` = fundo índigo sólido (usado em telas/fundos claros, ex.: Conta).
 */
export function Avatar({ src, name, size = 24, tone = "solid" }: { src?: string; name: string; size?: number; tone?: "header" | "solid" }) {
  const dimStyle = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} style={dimStyle} className="rounded-full object-cover" />;
  }
  const toneCls = tone === "header" ? "bg-white/20 text-white" : "bg-gta-indigo text-white dark:bg-indigo-600";
  return (
    <span style={dimStyle} className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${toneCls}`}>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

export type Tone = "slate" | "green" | "amber" | "red" | "indigo";
const BADGE_TONE: Record<Tone, string> = {
  slate: "badge-slate",
  green: "badge-green",
  amber: "badge-amber",
  red: "badge-red",
  indigo: "badge-indigo",
};

/**
 * Pílula de status.
 *
 * Para destaque PONTUAL — um rótulo que aparece uma vez na tela ("Indicado",
 * "Sem duração"). Numa coluna de tabela, onde o mesmo estado se repete dezenas
 * de vezes, use `<Marca>`: fundo colorido em toda linha satura a tela e a cor
 * deixa de significar alguma coisa.
 */
export function Badge({ tone = "slate", dot, children, className = "" }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`badge ${BADGE_TONE[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

const MARCA_PONTO: Record<Tone, string> = {
  slate: "bg-slate-400 dark:bg-slate-500",
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  indigo: "bg-gta-indigo dark:bg-indigo-400",
};

/**
 * Estado em lista: ponto colorido + texto no tom normal.
 *
 * O ponto dá a leitura por varredura; o texto continua legível porque não está
 * sobre fundo tingido em corpo pequeno. É o formato certo para colunas de
 * tabela — a cor distingue sem pintar a linha inteira.
 *
 * A cor é redundante de propósito: o rótulo sempre acompanha, para quem não
 * distingue verde de âmbar continuar lendo a informação.
 */
export function Marca({ tone = "slate", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${MARCA_PONTO[tone]}`} aria-hidden />
      <span className="text-slate-700 dark:text-slate-300">{children}</span>
    </span>
  );
}

/**
 * Bloco de indicador (rótulo + valor). `destaque` = fundo navy (KPI principal).
 * `tone` pinta o valor (ex.: margem boa/ruim) quando não está em destaque.
 */
export function Kpi({ label, value, destaque, tone, className = "" }: { label: ReactNode; value: ReactNode; destaque?: boolean; tone?: "green" | "amber" | "red"; className?: string }) {
  const toneCls = tone === "green" ? "text-green-600 dark:text-green-400"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400"
    : tone === "red" ? "text-red-600 dark:text-red-400"
    : "text-gta-navy dark:text-slate-100";
  return (
    <div className={`rounded-md p-2.5 shadow-sm ${destaque ? "bg-gta-navy text-white" : "bg-white dark:bg-slate-800"} ${className}`}>
      <div className={`text-xs ${destaque ? "text-slate-300" : "text-slate-600 dark:text-slate-400"}`}>{label}</div>
      <div className={`mt-0.5 font-semibold ${destaque ? "" : toneCls}`}>{value}</div>
    </div>
  );
}

/** Grade de KPIs dentro de uma caixa cinza (o padrão de "resumo" dos cálculos). */
export function KpiGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-900/50 ${className}`}>{children}</div>;
}

/** Cabeçalho de página: título + subtítulo + ações à direita. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Seção de formulário: cartão + título (+ subtítulo/ações) + conteúdo. */
export function SectionCard({ title, subtitle, actions, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  const temCabecalho = Boolean(title || actions);
  return (
    <section className={`section-card ${className}`}>
      {temCabecalho && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="mt-1 subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={temCabecalho ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

/** Estado vazio padronizado (listas/tabelas sem resultado). */
export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 ${className}`}>
      {children}
    </div>
  );
}

/** Link "voltar" padrão: botão fantasma com seta (usado no topo de páginas de detalhe). */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn-ghost">
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  );
}

const ALERT_ICONE = {
  amber: AlertTriangle,
  red: XCircle,
  green: CheckCircle2,
  indigo: Info,
} as const;

/**
 * Mensagem contextual em caixa (aviso, erro, sucesso, informação).
 *
 * O ícone identifica o tipo sem depender só da cor — quem não distingue verde
 * de vermelho ainda entende a mensagem. `red` e `amber` são anunciados por
 * leitor de tela assim que aparecem, porque interrompem o que a pessoa fazia.
 */
export function Alert({ tone = "amber", titulo, children, className = "" }: {
  tone?: "amber" | "red" | "green" | "indigo";
  titulo?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Icone = ALERT_ICONE[tone];
  return (
    <div className={`alert alert-${tone} ${className}`} role={tone === "red" || tone === "amber" ? "alert" : undefined}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {titulo && <strong className="mr-1">{titulo}</strong>}
        {children}
      </div>
    </div>
  );
}

/**
 * Alternador entre poucas visões (semana/mês, parcelado/a combinar).
 * `aria-pressed` carrega o estado — para o leitor de tela e para o CSS, que
 * pinta o item ativo a partir dele (sem classe condicional espalhada).
 */
export function Segmented<T extends string>({ value, onChange, options, className = "", aria }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  aria?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={aria}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className="segmented-item">
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Estado de carregamento padrão das listas e painéis. */
export function Loading({ children = "Carregando…" }: { children?: ReactNode }) {
  return <p className="subtitle" role="status">{children}</p>;
}

/**
 * Casca das telas de autenticação (entrar, definir senha) — as únicas fora do
 * cabeçalho da aplicação. Fica aqui para que as duas tenham exatamente a mesma
 * marca, o mesmo cartão e o mesmo respiro; separadas, já tinham divergido no
 * tamanho do logo e do título.
 */
export function AuthShell({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gta-navy to-gta-navy2 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="h-1.5 w-full bg-gta-orange" />
        <div className="p-8">
          <div className="mb-6 text-center">
            {/* alt vazio: o <h1> logo abaixo já diz o nome — com alt o leitor
                de tela anunciaria "GTA Energia" duas vezes seguidas. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gta-icon.png" alt="" className="mx-auto h-20 w-auto" />
            <h1 className="mt-3 text-xl font-bold tracking-tight text-gta-navy dark:text-slate-100">{titulo}</h1>
            {subtitulo && <p className="mt-1 subtitle">{subtitulo}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
