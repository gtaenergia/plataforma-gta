"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CloudLightning, LayoutGrid, Plus, Search } from "lucide-react";
import { Badge, EmptyState, Loading } from "@/components/ui";
import { dadosVazios, type DadosProjeto, type ResumoProjeto } from "@/lib/engenharia/tipos";
import { fmtData } from "@/lib/engenharia/formato";
import { Dialogo, toast, Toasts } from "./comum";
import { FormProjeto } from "./FormProjeto";

export function ProjetosEngenharia() {
  const router = useRouter();
  const [lista, setLista] = useState<ResumoProjeto[] | null>(null);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<DadosProjeto | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    fetch("/api/engenharia/projetos")
      .then((r) => r.json())
      .then((j) => setLista(j.projetos ?? []))
      .catch(() => setLista([]));
  }, []);

  const filtrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!lista) return [];
    if (!t) return lista;
    return lista.filter((p) => [p.nome, p.cliente, p.cidade].some((x) => x.toLowerCase().includes(t)));
  }, [lista, busca]);

  async function criar() {
    if (!novo) return;
    if (!novo.nome.trim()) return toast("Informe o nome do projeto.", "erro");
    setCriando(true);
    try {
      const res = await fetch("/api/engenharia/projetos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dados: novo }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao criar.");
      router.push(`/engenharia/${j.projeto.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao criar.", "erro");
      setCriando(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="field-input" style={{ paddingLeft: "2.25rem" }} placeholder="Buscar por projeto, cliente ou cidade" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar projetos" />
        </div>
        <button type="button" className="btn-primary" onClick={() => setNovo(dadosVazios())}>
          <Plus className="h-4 w-4" /> Novo projeto
        </button>
      </div>

      <div className="mt-5">
        {lista == null ? (
          <Loading />
        ) : filtrada.length === 0 ? (
          <EmptyState>{lista.length ? "Nenhum projeto encontrado." : "Nenhum projeto ainda. Crie o primeiro para abrir a análise de risco ou o quadro de cargas."}</EmptyState>
        ) : (
          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th className="hidden md:table-cell">Cliente</th>
                  <th className="hidden md:table-cell">Data</th>
                  <th>Ferramentas</th>
                  <th className="hidden lg:table-cell">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/engenharia/${p.id}`} className="font-semibold text-gta-navy hover:text-gta-indigo hover:underline dark:text-slate-100">
                        {p.nome || "(sem nome)"}
                      </Link>
                      {p.cidade && <div className="hint">{p.cidade}</div>}
                    </td>
                    <td className="hidden md:table-cell">{p.cliente || "—"}</td>
                    <td className="hidden md:table-cell">{fmtData(p.data)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {p.temRisco && (
                          <Badge tone="indigo">
                            <CloudLightning className="h-3 w-3" /> Risco
                          </Badge>
                        )}
                        {p.temQuadro && (
                          <Badge tone="indigo">
                            <LayoutGrid className="h-3 w-3" /> Quadro
                          </Badge>
                        )}
                        {!p.temRisco && !p.temQuadro && <span className="hint">—</span>}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell hint">{fmtData(p.atualizadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialogo aberto={novo != null} titulo="Novo projeto" onFechar={() => setNovo(null)} largura="max-w-2xl">
        {novo && (
          <>
            <p className="mb-4 hint">Se o responsável técnico ficar em branco, a plataforma repete o do último projeto (sem a ART).</p>
            <FormProjeto dados={novo} onChange={setNovo} />
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setNovo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={criar} disabled={criando}>
                {criando ? "Criando…" : "Criar projeto"}
              </button>
            </div>
          </>
        )}
      </Dialogo>
      <Toasts />
    </div>
  );
}
