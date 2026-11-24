"use client";

import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Campo } from "@/components/Campo";
import type { DadosProjeto, ResponsavelTecnico } from "@/lib/engenharia/tipos";
import { toast } from "./comum";

/** Dados da obra + responsável técnico. Controlado: quem usa decide quando salvar. */
export function FormProjeto({ dados, onChange }: { dados: DadosProjeto; onChange: (d: DadosProjeto) => void }) {
  const set = <K extends keyof DadosProjeto>(k: K, v: DadosProjeto[K]) => onChange({ ...dados, [k]: v });
  const setRt = <K extends keyof ResponsavelTecnico>(k: K, v: ResponsavelTecnico[K]) => onChange({ ...dados, rt: { ...dados.rt, [k]: v } });
  const arquivo = useRef<HTMLInputElement>(null);

  function carregarLogo(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpeg)$/.test(f.type)) return toast("Use uma imagem PNG ou JPEG.", "erro");
    if (f.size > 400_000) return toast("A logo deve ter até 400 KB.", "erro");
    const r = new FileReader();
    r.onload = () => setRt("logo", String(r.result));
    r.readAsDataURL(f);
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="section-title">Obra</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Campo label="Nome do projeto *" className="sm:col-span-2">
            <input className="field-input" value={dados.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Pousada Alto Paraíso — bloco A" />
          </Campo>
          <Campo label="Cliente">
            <input className="field-input" value={dados.cliente} onChange={(e) => set("cliente", e.target.value)} />
          </Campo>
          <Campo label="CNPJ/CPF">
            <input className="field-input" value={dados.documento} onChange={(e) => set("documento", e.target.value)} />
          </Campo>
          <Campo label="Endereço da obra" className="sm:col-span-2">
            <input className="field-input" value={dados.endereco} onChange={(e) => set("endereco", e.target.value)} />
          </Campo>
          <Campo label="Cidade/UF">
            <input className="field-input" value={dados.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Goiânia/GO" />
          </Campo>
          <Campo label="Data">
            <input type="date" className="field-input" value={dados.data} onChange={(e) => set("data", e.target.value)} />
          </Campo>
          <Campo label="Descrição" className="sm:col-span-2">
            <textarea className="field-input min-h-[72px]" value={dados.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Campo>
        </div>
      </fieldset>

      <fieldset>
        <legend className="section-title">Responsável técnico</legend>
        <p className="mt-1 hint">Aparece no cabeçalho das ferramentas, na capa e no fecho dos laudos.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Campo label="Nome">
            <input className="field-input" value={dados.rt.nome} onChange={(e) => setRt("nome", e.target.value)} />
          </Campo>
          <Campo label="CREA/CFT">
            <input className="field-input" value={dados.rt.registro} onChange={(e) => setRt("registro", e.target.value)} />
          </Campo>
          <Campo label="Nº da ART/TRT">
            <input className="field-input" value={dados.rt.art} onChange={(e) => setRt("art", e.target.value)} />
          </Campo>
          <Campo label="Empresa">
            <input className="field-input" value={dados.rt.empresa} onChange={(e) => setRt("empresa", e.target.value)} />
          </Campo>
          <Campo label="CNPJ da empresa">
            <input className="field-input" value={dados.rt.cnpj} onChange={(e) => setRt("cnpj", e.target.value)} />
          </Campo>
          <Campo label="Telefone">
            <input className="field-input" value={dados.rt.telefone} onChange={(e) => setRt("telefone", e.target.value)} />
          </Campo>
          <Campo label="E-mail" className="sm:col-span-2">
            <input type="email" className="field-input" value={dados.rt.email} onChange={(e) => setRt("email", e.target.value)} />
          </Campo>
          <div className="sm:col-span-2">
            <span className="field-label">Logo dos laudos</span>
            <div className="flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dados.rt.logo || "/brand/gta-logo.png"} alt="Logo usada nos laudos" className="h-16 w-16 rounded border border-slate-200 bg-white object-contain p-1 dark:border-slate-600" />
              <input ref={arquivo} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => carregarLogo(e.target.files?.[0])} />
              <button type="button" className="btn-secondary" onClick={() => arquivo.current?.click()}>
                <ImagePlus className="h-4 w-4" /> Trocar logo
              </button>
              {dados.rt.logo && (
                <button type="button" className="btn-link-danger" onClick={() => setRt("logo", "")}>
                  <Trash2 className="h-4 w-4" /> Voltar à logo da GTA
                </button>
              )}
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
