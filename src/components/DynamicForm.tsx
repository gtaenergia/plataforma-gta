"use client";

import { useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  FormProvider,
  useFormContext,
  type UseFormReturn,
} from "react-hook-form";
import { X } from "lucide-react";
import type { FieldDef, FormSchema } from "@/services/types";

const widthClass: Record<string, string> = {
  full: "col-span-1 sm:col-span-6",
  half: "col-span-1 sm:col-span-3",
  third: "col-span-1 sm:col-span-2",
};

function buildDefaults(schema: FormSchema): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const out: Record<string, unknown> = {};
  for (const section of schema.sections) {
    for (const f of section.fields) {
      if (f.type === "array") {
        if (f.fixedRows) {
          out[f.name] = f.fixedRows.map((r) => ({ ...r.defaults }));
        } else if (f.defaultRows) {
          out[f.name] = f.defaultRows.map((r) => ({ ...r.defaults }));
        } else {
          const empty: Record<string, unknown> = {};
          for (const sub of f.itemFields ?? []) empty[sub.name] = "";
          out[f.name] = [empty];
        }
      } else if (f.type === "date") {
        out[f.name] = f.defaultValue ?? today;
      } else {
        out[f.name] = f.defaultValue ?? "";
      }
    }
  }
  return out;
}

export function DynamicForm({
  serviceKey,
  serviceLabel,
  formSchema,
}: {
  serviceKey: string;
  serviceLabel: string;
  formSchema: FormSchema;
}) {
  const defaults = useMemo(() => buildDefaults(formSchema), [formSchema]);
  const methods = useForm({ defaultValues: defaults });
  const [status, setStatus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function onSubmit(values: Record<string, unknown>) {
    setStatus(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey, formData: values }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Falha ao gerar o documento.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? decodeURIComponent(match[1]) : `${serviceKey}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Documento gerado e baixado com sucesso.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Erro ao gerar.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-8">
        {formSchema.sections.map((section) => (
          <section key={section.title} className="section-card">
            <h2 className="section-title">{section.title}</h2>
            {section.description && (
              <p className="mt-1 subtitle">{section.description}</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
              {section.fields.map((f) =>
                f.type === "array" ? (
                  <div key={f.name} className="sm:col-span-6">
                    <ArrayFieldEditor field={f} />
                  </div>
                ) : (
                  <ScalarField key={f.name} field={f} methods={methods} />
                ),
              )}
            </div>
          </section>
        ))}

        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={generating}>
            {generating ? "Gerando…" : `Gerar proposta (${serviceLabel})`}
          </button>
          {status && <span className="text-sm text-slate-600 dark:text-slate-300">{status}</span>}
        </div>
      </form>
    </FormProvider>
  );
}

function ScalarField({
  field,
  methods,
}: {
  field: FieldDef;
  methods: UseFormReturn<Record<string, unknown>>;
}) {
  const { register, formState } = methods;
  const err = formState.errors[field.name];
  const cls = widthClass[field.width ?? "full"] ?? widthClass.full;

  return (
    <div className={cls}>
      <label className="field-label">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea className="field-input min-h-[90px]" {...register(field.name)} placeholder={field.placeholder} />
      ) : field.type === "select" ? (
        <select className="field-input" {...register(field.name)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="field-input"
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          step={field.type === "number" ? "any" : undefined}
          {...register(field.name)}
          placeholder={field.placeholder}
        />
      )}
      {field.help && <p className="mt-1 hint">{field.help}</p>}
      {err && <p className="field-error">{String(err.message ?? "Campo inválido")}</p>}
    </div>
  );
}

function ArrayFieldEditor({ field }: { field: FieldDef }) {
  const { register, control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: field.name });
  const isFixed = Boolean(field.fixedRows);
  const cols = field.itemFields ?? [];

  return (
    <div>
      <label className="field-label">{field.label}</label>
      <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
        <table className="table-compacta">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.name} className="px-2 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              {!isFixed && <th className="w-10 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {fields.map((row, i) => (
              <tr key={row.id}>
                {cols.map((c) => (
                  <td key={c.name} className="px-2 py-1">
                    <input
                      className="field-input"
                      {...register(`${field.name}.${i}.${c.name}` as const)}
                      placeholder={c.label}
                    />
                  </td>
                ))}
                {!isFixed && (
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                      title="Remover"
                      aria-label="Remover linha"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!isFixed && (
        <button
          type="button"
          onClick={() => append(Object.fromEntries(cols.map((c) => [c.name, ""])))}
          className="btn-secondary mt-2"
        >
          {field.addLabel ?? "Adicionar linha"}
        </button>
      )}
    </div>
  );
}
