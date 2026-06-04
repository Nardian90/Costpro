"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MessageCircle,
  Camera,
  Table,
  Sparkles,
  Download,
  ImageOff,
  ImageIcon,
  Palette,
} from "lucide-react";
import { BaseModal } from "@/components/ui/BaseModal";
import { PrimaryButton, SecondaryButton } from "@/components/ui/atomic";
import type {
  TemplateConfig,
  TemplateCategory,
} from "./catalog-templates/types";
import type { OrganizedProducts } from "./catalog-templates/shared";
import { formatPrice } from "./catalog-templates/shared";
import { cn } from "@/lib/utils";

// ── Icon Map ────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  MessageCircle,
  Camera,
  Table,
  Sparkles,
};

// ── Category Labels ─────────────────────────────────────────

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  whatsapp: "WhatsApp",
  social: "Redes Sociales",
  "price-list": "B2B / Mayorista",
  catalog: "Catalogo Profesional",
};

// ── Color Theme Presets ──────────────────────────────────────

export interface ColorTheme {
  id: string;
  name: string;
  rgb: [number, number, number];
  hex: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: "green",  name: "Verde",   rgb: [21, 128, 61],  hex: "#15803d" },
  { id: "blue",   name: "Azul",    rgb: [37, 99, 235],  hex: "#2563eb" },
  { id: "red",    name: "Rojo",    rgb: [220, 38, 38],  hex: "#dc2626" },
  { id: "orange", name: "Naranja", rgb: [234, 88, 12],  hex: "#ea580c" },
  { id: "purple", name: "Morado",  rgb: [147, 51, 234], hex: "#9333ea" },
  { id: "teal",   name: "Teal",    rgb: [15, 118, 110], hex: "#0f766e" },
  { id: "slate",  name: "Grafito", rgb: [51, 65, 85],   hex: "#334155" },
  { id: "amber",  name: "Dorado", rgb: [180, 83, 9],   hex: "#b45309" },
];

// ── Avatar Presets ──────────────────────────────────────────

export interface AvatarPreset {
  id: string;
  name: string;
  path: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "avatar-01", name: "Ferretería",  path: "/avatars/avatar-01.png" },
  { id: "avatar-02", name: "Tienda",     path: "/avatars/avatar-02.png" },
  { id: "avatar-03", name: "Taller",     path: "/avatars/avatar-03.png" },
  { id: "avatar-04", name: "Ofertas",    path: "/avatars/avatar-04.png" },
  { id: "avatar-05", name: "Premium",    path: "/avatars/avatar-05.png" },
  { id: "avatar-06", name: "Corporativo", path: "/avatars/avatar-06.png" },
];

// ── Props ────────────────────────────────────────────────────

interface CatalogExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: TemplateConfig[];
  organized: OrganizedProducts;
  isExporting: boolean;
  onExport: (templateId: string, themeColor?: [number, number, number], avatarPath?: string) => void;
}

// ── Preview Card (simulated) ────────────────────────────────

function TemplatePreviewCard({ template }: { template: TemplateConfig }) {
  const Icon = ICON_MAP[template.icon] || Sparkles;
  const formatColor =
    template.format === "pdf"
      ? "bg-red-500/10 text-red-500"
      : "bg-blue-500/10 text-blue-500";

  return (
    <div className="relative aspect-[3/4] w-full rounded-xl border border-border bg-card overflow-hidden group">
      {/* Simulated preview background */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 gap-3">
        {template.format === "jpg" ? (
          <div className="grid grid-cols-2 gap-1.5 w-16 opacity-20">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded bg-foreground/60" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1 w-16 opacity-20">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-2 rounded bg-foreground/60" />
            ))}
          </div>
        )}
        <Icon className="w-10 h-10 text-primary/30" />
      </div>

      {/* Format badge */}
      <div
        className={cn(
          "absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-black uppercase",
          formatColor,
        )}
      >
        {template.badge}
      </div>

      {/* Name overlay on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-card via-card/90 to-transparent">
        <p className="text-xs font-black uppercase tracking-wider text-foreground truncate">
          {template.name}
        </p>
      </div>
    </div>
  );
}

// ── Main Modal ──────────────────────────────────────────────

export function CatalogExportModal({
  open,
  onOpenChange,
  templates,
  organized,
  isExporting,
  onExport,
}: CatalogExportModalProps) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateConfig | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ColorTheme>(COLOR_THEMES[0]);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarPreset | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    TemplateCategory | "all"
  >("all");

  const categories: (TemplateCategory | "all")[] = [
    "all",
    "whatsapp",
    "social",
    "price-list",
    "catalog",
  ];

  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  const handleExport = () => {
    if (!selectedTemplate || isExporting) return;
    onExport(selectedTemplate.id, selectedTheme.rgb, selectedAvatar?.path);
  };

  return (
    <BaseModal
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelectedTemplate(null);
        onOpenChange(v);
      }}
      title={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-lg tracking-tight">
              Generar Catalogo
            </h3>
            <p className="text-xs text-muted-foreground">
              Selecciona una plantilla y tema de color
            </p>
          </div>
        </div>
      }
      maxWidth="sm:max-w-2xl"
    >
      <div className="space-y-5">
        {/* Stats bar */}
        <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 border border-border">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">
              {organized.withImages.length}
            </span>
            <span className="text-xs text-muted-foreground">con imagen</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <ImageOff className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold">
              {organized.withoutImages.length}
            </span>
            <span className="text-xs text-muted-foreground">sin imagen</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            {organized.total} productos total
          </div>
        </div>

        {/* ── Color Theme Picker ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Tema de color
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setSelectedTheme(theme)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
                  selectedTheme.id === theme.id
                    ? "border-foreground/40 bg-foreground/5"
                    : "border-transparent hover:border-foreground/20",
                )}
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full transition-transform",
                    selectedTheme.id === theme.id && "scale-125 ring-2 ring-foreground/30 ring-offset-1",
                  )}
                  style={{ backgroundColor: theme.hex }}
                />
                <span className="text-[11px] font-bold text-foreground">
                  {theme.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Avatar Picker ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">
              Avatar de portada
            </span>
            <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {/* None option */}
            <button
              type="button"
              onClick={() => setSelectedAvatar(null)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                selectedAvatar === null
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-primary/20",
              )}
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs text-muted-foreground font-bold">Sin</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Ninguno</span>
            </button>
            {AVATAR_PRESETS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                onClick={() => setSelectedAvatar(avatar)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                  selectedAvatar?.id === avatar.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-primary/20",
                )}
              >
                <img
                  src={avatar.path}
                  alt={avatar.name}
                  className={cn(
                    "w-12 h-12 rounded-full object-cover transition-transform",
                    selectedAvatar?.id === avatar.id && "scale-110 ring-2 ring-primary ring-offset-1",
                  )}
                />
                <span className="text-[10px] text-muted-foreground">{avatar.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setSelectedTemplate(null);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all border",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/30",
              )}
            >
              {cat === "all" ? "Todas" : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {filteredTemplates.map((template) => {
            const isSelected = selectedTemplate?.id === template.id;
            return (
              <motion.button
                key={template.id}
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedTemplate(template)}
                className={cn(
                  "relative rounded-xl border-2 p-1 transition-all cursor-pointer",
                  isSelected
                    ? "border-primary shadow-lg shadow-primary/20"
                    : "border-transparent hover:border-primary/30",
                )}
              >
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-10">
                    <span className="text-[10px] text-primary-foreground font-black">
                      ✓
                    </span>
                  </div>
                )}
                <TemplatePreviewCard template={template} />
                <p className="mt-2 text-[11px] font-bold text-center text-foreground truncate px-1">
                  {template.name}
                </p>
                <p className="text-[10px] text-center text-muted-foreground px-1 line-clamp-2">
                  {template.description}
                </p>
              </motion.button>
            );
          })}
        </div>

        {/* Export button */}
        <AnimatePresence>
          {selectedTemplate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon =
                      ICON_MAP[selectedTemplate.icon] || Sparkles;
                    return (
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                    );
                  })()}
                  <div>
                    <p className="text-sm font-black text-foreground">
                      {selectedTemplate.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedTemplate.badge} —{" "}
                      {selectedTemplate.multiPage
                        ? "multi-pagina"
                        : "1 pagina"}
                    </p>
                  </div>
                </div>
                <PrimaryButton
                  label={
                    isExporting
                      ? "Generando..."
                      : "Generar y Descargar"
                  }
                  icon={Download}
                  onClick={handleExport}
                  disabled={isExporting || organized.total === 0}
                  className="min-w-[180px]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {organized.total === 0 && (
          <div className="text-center py-8">
            <p className="text-sm font-bold text-muted-foreground">
              No hay productos para exportar
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Agrega productos al catalogo para generar una exportacion
            </p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
