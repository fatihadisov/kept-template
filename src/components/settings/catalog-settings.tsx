"use client";

import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { archiveCategoryAction, deleteBudgetAction, deleteCategoryAction, saveCategoryAction, upsertBudgetAction } from "@/app/actions";
import { useApp } from "@/components/app-provider";
import { ICON_KEYS } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { IconBubble } from "@/components/ui/icon-bubble";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Swatches } from "@/components/ui/swatches";
import { useForm } from "@/components/use-form";
import type { BudgetView, CategoryView } from "@/lib/app-types";
import { DEFAULT_CATEGORIES } from "@/lib/defaults";
import { cn } from "@/lib/utils";
import { Section } from "./parts";

const PALETTE = [...new Set([...DEFAULT_CATEGORIES.map((c) => c.color), "#6F86D6", "#D4A24C", "#8E6BD1", "#3FA796"])];
const BUCKET_LABEL = { NEEDS: "Need", WANTS: "Want", OTHER: "Other" } as const;

function CategorySheet({ open, onOpenChange, category, used }: { open: boolean; onOpenChange: (o: boolean) => void; category?: CategoryView | null; used: number }) {
  const form = useForm({ name: category?.name ?? "", icon: category?.icon ?? "circle-ellipsis", color: category?.color ?? PALETTE[0], bucket: (category?.bucket ?? "WANTS") as CategoryView["bucket"] });
  const { values: v, set, errors, formError, pending } = form;

  async function archive() {
    if (!category) return;
    const res = await archiveCategoryAction(category.id, !category.archived);
    if (res.ok) {
      toast.success(category.archived ? "Restored" : "Archived. Past entries keep it.");
      onOpenChange(false);
    } else toast.error(res.error);
  }
  async function remove() {
    if (!category) return;
    const res = await deleteCategoryAction(category.id);
    if (res.ok) {
      toast.success("Category deleted");
      onOpenChange(false);
    } else toast.error(res.error);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={category ? "Edit category" : "New category"}
      footer={
        <div className="flex items-center gap-2.5">
          {category ? (
            <>
              <Button variant="subtle" size="icon" onClick={archive} aria-label={category.archived ? "Restore" : "Archive"} title={category.archived ? "Restore" : "Archive"}>
                {category.archived ? <ArchiveRestore className="size-[18px]" /> : <Archive className="size-[18px]" />}
              </Button>
              {used === 0 ? (
                <Button variant="danger" size="icon" onClick={remove} aria-label="Delete category">
                  <Trash2 className="size-[18px]" />
                </Button>
              ) : null}
            </>
          ) : null}
          <Button variant="primary" size="lg" className="flex-1" disabled={pending} onClick={() => form.submit((vals) => saveCategoryAction(category?.id ?? null, vals), { success: "Category saved", onOk: () => onOpenChange(false) })}>
            {pending ? "Saving…" : category ? "Save changes" : "Add category"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <IconBubble icon={v.icon} color={v.color} size={56} />
          <Field label="Name" error={errors.name} className="flex-1">
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Pets" autoFocus invalid={Boolean(errors.name)} />
          </Field>
        </div>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {ICON_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => set("icon", key)} aria-pressed={v.icon === key} aria-label={key} className={cn("rounded-full p-0.5 transition active:scale-90", v.icon === key ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100")}>
                <IconBubble icon={key} color={v.color} size={34} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Colour">
          <Swatches value={v.color} onChange={(c) => set("color", c)} options={PALETTE.map((c) => ({ value: c, css: c }))} />
        </Field>
        <Field label="For the 50/30/20 budget, this is a" hint="Needs are what you can't skip; wants are what you could.">
          <Segmented
            full
            value={v.bucket}
            onChange={(b) => set("bucket", b)}
            options={[
              { value: "NEEDS", label: "Need" },
              { value: "WANTS", label: "Want" },
              { value: "OTHER", label: "Neither" },
            ]}
          />
        </Field>
        {formError && Object.keys(errors).length === 0 ? <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-[14px] font-medium text-c-out">{formError}</p> : null}
      </div>
    </Sheet>
  );
}

export function CategoriesSettings({ categories, usage }: { categories: CategoryView[]; usage: Record<string, number> }) {
  const [edit, setEdit] = useState<{ category: CategoryView | null; key: number } | null>(null);
  const live = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);

  async function setBucket(c: CategoryView, bucket: CategoryView["bucket"]) {
    const res = await saveCategoryAction(c.id, { name: c.name, icon: c.icon, color: c.color, bucket });
    if (res.ok) toast.success(`${c.name}: ${BUCKET_LABEL[bucket].toLowerCase()}`);
    else toast.error(res.error);
  }

  const renderRow = (c: CategoryView) => (
    <li key={c.id} className="flex items-center gap-3.5 border-b border-line px-3 py-2.5 last:border-b-0 sm:px-4">
      <IconBubble icon={c.icon} color={c.color} size={38} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[15px] font-semibold", c.archived ? "text-ink-3" : "text-ink")}>{c.name}</p>
        <p className="text-[12.5px] text-ink-3">{usage[c.id] ? `${usage[c.id]} ${usage[c.id] === 1 ? "entry" : "entries"}` : "Not used yet"}</p>
      </div>
      <div className="hidden sm:block">
        <Segmented
          size="sm"
          value={c.bucket}
          onChange={(b) => setBucket(c, b)}
          label={`${c.name}: need or want`}
          options={[
            { value: "NEEDS", label: "Need" },
            { value: "WANTS", label: "Want" },
            { value: "OTHER", label: "—" },
          ]}
        />
      </div>
      <Button variant="ghost" size="iconSm" onClick={() => setEdit({ category: c, key: Date.now() })} aria-label={`Edit ${c.name}`}>
        <Pencil className="size-4" />
      </Button>
    </li>
  );

  return (
    <Section
      id="categories"
      title="Categories"
      intro="Rename, recolour or archive any of them, and add your own. Archived categories keep their history."
      action={
        <Button variant="soft" size="sm" onClick={() => setEdit({ category: null, key: Date.now() })}>
          <Plus className="size-4" />
          Add
        </Button>
      }
    >
      <ul>{live.map(renderRow)}</ul>
      {archived.length > 0 ? (
        <details className="px-3 pb-2 pt-1 sm:px-4">
          <summary className="cursor-pointer py-2 text-[13.5px] font-semibold text-ink-2 hover:text-ink">Archived ({archived.length})</summary>
          <ul className="-mx-3 sm:-mx-4">{archived.map(renderRow)}</ul>
        </details>
      ) : null}
      {edit ? <CategorySheet key={edit.key} open onOpenChange={(o) => !o && setEdit(null)} category={edit.category} used={edit.category ? (usage[edit.category.id] ?? 0) : 0} /> : null}
    </Section>
  );
}

export function BudgetsSettings({ categories, budgets }: { categories: CategoryView[]; budgets: BudgetView[] }) {
  const app = useApp();
  const base = app.settings.baseCurrency;
  const rows: { key: string; categoryId: string | null; name: string; icon: string; color: string }[] = [
    { key: "all", categoryId: null, name: "All spending", icon: "wallet", color: "#4E8D6E" },
    ...categories.filter((c) => !c.archived).map((c) => ({ key: c.id, categoryId: c.id, name: c.name, icon: c.icon, color: c.color })),
  ];
  const byCat = new Map(budgets.map((b) => [b.categoryId, b]));

  async function save(categoryId: string | null, text: string) {
    const existing = byCat.get(categoryId);
    const value = text.trim();
    if (!value && !existing) return;
    if (!value && existing) {
      const res = await deleteBudgetAction(existing.id);
      if (res.ok) toast.success("Budget removed");
      else toast.error(res.error);
      return;
    }
    if (existing && Number(existing.amount) === Number(value.replace(",", "."))) return;
    const res = await upsertBudgetAction({ categoryId, amount: value });
    if (res.ok) toast.success("Budget saved");
    else toast.error(res.fieldErrors?.amount ?? res.error);
  }

  return (
    <Section id="budgets" title="Monthly budgets" intro="Optional limits. You'll see a warning on the overview when a category gets close. Leave blank for no limit.">
      <ul>
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3.5 border-b border-line px-3 py-2.5 last:border-b-0 sm:px-4">
            <IconBubble icon={r.icon} color={r.color} size={36} />
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{r.name}</p>
            <div className="flex items-center gap-2">
              <Input defaultValue={byCat.get(r.categoryId)?.amount ?? ""} key={byCat.get(r.categoryId)?.amount ?? "none"} inputMode="decimal" placeholder="No limit" aria-label={`${r.name} monthly limit`} className="num h-10 w-32 text-right" onBlur={(e) => void save(r.categoryId, e.target.value)} />
              <span className="w-9 text-[13px] text-ink-3">{base}</span>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
