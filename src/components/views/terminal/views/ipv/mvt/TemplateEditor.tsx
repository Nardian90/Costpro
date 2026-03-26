import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MVTTemplate, MVTSection, FieldConfig, FieldSource } from "@/lib/ipv/mvt/types";
import {
  Settings2, Plus, Trash2, Check, GripVertical,
  ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine,
  PlusCircle
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { v4 as uuidv4 } from 'uuid';

interface TemplateEditorProps {
  template: MVTTemplate;
  onSave: (template: MVTTemplate) => void;
}

// --- Sub-components for Sortable ---

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

const SortableItem = ({ id, children }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute left-[-24px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-slate-600 transition-opacity z-10"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      {children}
    </div>
  );
};

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave }) => {
  // Initialize with IDs if missing
  const ensureIds = (t: MVTTemplate): MVTTemplate => {
    const newT = JSON.parse(JSON.stringify(t));
    newT.sections = newT.sections.map((s: MVTSection) => ({
      ...s,
      _id: s._id || uuidv4(),
      fields: s.fields.map((f: FieldConfig) => ({
        ...f,
        _id: f._id || uuidv4()
      }))
    }));
    return newT;
  };

  const [editedTemplate, setEditedTemplate] = useState<MVTTemplate>(ensureIds(template));
  const [isModified, setIsModified] = useState(false);

  // Sync state when template prop changes
  useEffect(() => {
    setEditedTemplate(ensureIds(template));
    setIsModified(false);
  }, [template.id]);

  // Dialog States
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);

  // New Field State
  const [newField, setNewField] = useState<FieldConfig>({
    key: '',
    source: 'static',
    value: ''
  });

  // New Section State
  const [newSection, setNewSection] = useState<Partial<MVTSection>>({
    title: '',
    type: 'single',
    fields: [],
    dataSource: 'products'
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleFieldChange = (sectionIndex: number, fieldIndex: number, updates: Partial<FieldConfig>) => {
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[sectionIndex].fields[fieldIndex] = {
      ...newTemplate.sections[sectionIndex].fields[fieldIndex],
      ...updates
    };
    setEditedTemplate(newTemplate);
    setIsModified(true);
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[sectionIndex].fields.splice(fieldIndex, 1);
    setEditedTemplate(newTemplate);
    setIsModified(true);
    toast.info("Campo eliminado");
  };

  const removeSection = (sectionIndex: number) => {
    const newTemplate = { ...editedTemplate };
    newTemplate.sections.splice(sectionIndex, 1);
    setEditedTemplate(newTemplate);
    setIsModified(true);
    toast.info("Sección eliminada");
  };

  const handleAddField = () => {
    if (currentSectionIndex === null) return;
    if (!newField.key) {
      toast.error("El nombre del campo es obligatorio");
      return;
    }

    const newTemplate = { ...editedTemplate };
    newTemplate.sections[currentSectionIndex].fields.push({
      ...newField,
      _id: uuidv4()
    });
    setEditedTemplate(newTemplate);
    setIsModified(true);
    setIsFieldDialogOpen(false);
    setNewField({ key: '', source: 'static', value: '' });
    toast.success("Campo añadido correctamente");
  };

  const handleAddSection = () => {
    if (!newSection.title) {
      toast.error("El título de la sección es obligatorio");
      return;
    }

    const newTemplate = { ...editedTemplate };
    newTemplate.sections.push({
      title: newSection.title,
      type: newSection.type as 'single' | 'repeatable',
      fields: [],
      dataSource: newSection.dataSource as 'products' | 'movements',
      _id: uuidv4()
    });
    setEditedTemplate(newTemplate);
    setIsModified(true);
    setIsSectionDialogOpen(false);
    setNewSection({ title: '', type: 'single', fields: [], dataSource: 'products' });
    toast.success("Sección añadida correctamente");
  };

  const moveField = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= editedTemplate.sections[sectionIndex].fields.length) return;
    const newTemplate = { ...editedTemplate };
    const fields = [...newTemplate.sections[sectionIndex].fields];
    const [moved] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, moved);
    newTemplate.sections[sectionIndex].fields = fields;
    setEditedTemplate(newTemplate);
    setIsModified(true);
  };

  const moveSection = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= editedTemplate.sections.length) return;
    const newTemplate = { ...editedTemplate };
    const sections = [...newTemplate.sections];
    const [moved] = sections.splice(fromIndex, 1);
    sections.splice(toIndex, 0, moved);
    newTemplate.sections = sections;
    setEditedTemplate(newTemplate);
    setIsModified(true);
  };

  const handleDragEndFields = (event: DragEndEvent, sectionIndex: number) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = editedTemplate.sections[sectionIndex].fields.findIndex(f => f._id === active.id);
      const newIndex = editedTemplate.sections[sectionIndex].fields.findIndex(f => f._id === over.id);

      const newTemplate = { ...editedTemplate };
      newTemplate.sections[sectionIndex].fields = arrayMove(newTemplate.sections[sectionIndex].fields, oldIndex, newIndex);
      setEditedTemplate(newTemplate);
      setIsModified(true);
    }
  };

  const handleDragEndSections = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = editedTemplate.sections.findIndex(s => s._id === active.id);
      const newIndex = editedTemplate.sections.findIndex(s => s._id === over.id);

      const newTemplate = { ...editedTemplate };
      newTemplate.sections = arrayMove(newTemplate.sections, oldIndex, newIndex);
      setEditedTemplate(newTemplate);
      setIsModified(true);
    }
  };

  const handleSave = () => {
    // Strip internal _id before saving to avoid polluting DB if desired
    // (Though Dexie handles extra fields fine)
    const toSave = JSON.parse(JSON.stringify(editedTemplate));
    // toSave.sections = toSave.sections.map((s: any) => {
    //   const { _id, ...rest } = s;
    //   return { ...rest, fields: s.fields.map(({ _id, ...f }: any) => f) };
    // });
    onSave(toSave);
    setIsModified(false);
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg font-bold uppercase tracking-tight">Configuración de Estructura MVT</CardTitle>
            <CardDescription>Personaliza los campos y secciones del archivo de exportación.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSectionDialogOpen(true)}
              className="h-9 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Nuevo Grupo
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isModified}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md h-9"
            >
              <Check className="w-4 h-4 mr-2" />
              Guardar Cambios
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEndSections}
        >
          <SortableContext
            items={editedTemplate.sections.map(s => s._id!)}
            strategy={verticalListSortingStrategy}
          >
            <Accordion type="multiple" className="w-full space-y-3">
              {editedTemplate.sections.map((section, sIdx) => (
                <SortableItem key={section._id} id={section._id!}>
                  <AccordionItem value={section._id!} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center bg-slate-50/80 pr-2">
                      <AccordionTrigger className="hover:no-underline py-3 px-4 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                            <Settings2 className="w-4 h-4 text-indigo-500" />
                          </div>
                          <div className="text-left">
                            <span className="font-bold text-sm text-slate-700 uppercase">{section.title}</span>
                            <p className="text-[10px] text-slate-400 font-medium tracking-wide">
                              {section.type === 'repeatable' ? `REPETIBLE (${section.dataSource})` : 'BLOQUE ÚNICO'}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, 0)} title="Mover al principio">
                          <ArrowUpToLine className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, sIdx - 1)} title="Subir">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, sIdx + 1)} title="Bajar">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, editedTemplate.sections.length - 1)} title="Mover al final">
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removeSection(sIdx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <AccordionContent className="pt-4 pb-4 px-4 bg-white">
                      <div className="space-y-4">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleDragEndFields(e, sIdx)}
                        >
                          <SortableContext
                            items={section.fields.map(f => f._id!)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {section.fields.map((field, fIdx) => (
                                <SortableItem key={field._id} id={field._id!}>
                                  <div className="grid grid-cols-12 gap-3 items-end p-3 rounded-lg border border-slate-100 bg-slate-50/30 hover:bg-slate-50 transition-colors relative group/field">
                                    <div className="col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Etiqueta/Key</Label>
                                      <Input
                                        value={field.key}
                                        className="h-8 text-xs font-mono bg-white border-slate-200"
                                        onChange={(e) => handleFieldChange(sIdx, fIdx, { key: e.target.value })}
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Origen</Label>
                                      <Select
                                        value={field.source}
                                        onValueChange={(val) => handleFieldChange(sIdx, fIdx, { source: val as FieldSource })}
                                      >
                                        <SelectTrigger className="h-8 text-xs bg-white border-slate-200">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="static">Estático</SelectItem>
                                          <SelectItem value="dynamic">Dinámico</SelectItem>
                                          <SelectItem value="expression">Expresión</SelectItem>
                                          <SelectItem value="template">Template</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Valor / Path</Label>
                                      <Input
                                        value={field.value}
                                        className="h-8 text-xs font-mono bg-white border-slate-200"
                                        onChange={(e) => handleFieldChange(sIdx, fIdx, { value: e.target.value })}
                                      />
                                    </div>
                                    <div className="col-span-3 flex items-center justify-end gap-0.5">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => moveField(sIdx, fIdx, 0)} title="Primero">
                                        <ArrowUpToLine className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => moveField(sIdx, fIdx, fIdx - 1)} title="Subir">
                                        <ArrowUp className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => moveField(sIdx, fIdx, fIdx + 1)} title="Bajar">
                                        <ArrowDown className="w-3 h-3" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => moveField(sIdx, fIdx, section.fields.length - 1)} title="Último">
                                        <ArrowDownToLine className="w-3 h-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                        onClick={() => removeField(sIdx, fIdx)}
                                        title="Eliminar"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </SortableItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-dashed border-slate-300 h-9 text-xs font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                          onClick={() => {
                            setCurrentSectionIndex(sIdx);
                            setIsFieldDialogOpen(true);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5 mr-2" />
                          AÑADIR CAMPO A {section.title.toUpperCase()}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </SortableItem>
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>
      </CardContent>

      {/* Field Configuration Dialog */}
      <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Configurar Nuevo Campo</DialogTitle>
            <DialogDescription>
              Define las propiedades del campo antes de añadirlo a la sección.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field-key">Nombre del Campo (Key)</Label>
              <Input
                id="field-key"
                placeholder="Ej: Concepto, Almacen, etc."
                value={newField.key}
                onChange={(e) => setNewField({...newField, key: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Origen de Datos</Label>
              <Select
                value={newField.source}
                onValueChange={(val) => setNewField({...newField, source: val as FieldSource})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Estático (Valor fijo)</SelectItem>
                  <SelectItem value="dynamic">Dinámico (Desde DB)</SelectItem>
                  <SelectItem value="expression">Expresión (Lógica JS)</SelectItem>
                  <SelectItem value="template">Template (String Literals)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="field-value">Valor / Ruta / Expresión</Label>
              <Input
                id="field-value"
                placeholder="Valor o path del dato"
                value={newField.value}
                onChange={(e) => setNewField({...newField, value: e.target.value})}
              />
              <p className="text-[10px] text-slate-400 italic">
                {newField.source === 'dynamic' ? 'Ej: products.length, settings.almacen' : 'Introduce el valor deseado.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFieldDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddField} className="bg-indigo-600 hover:bg-indigo-700">Añadir Campo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section Configuration Dialog */}
      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Añadir Nuevo Grupo (Sección)</DialogTitle>
            <DialogDescription>
              Crea un nuevo bloque de datos para la estructura del archivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-title">Título de la Sección</Label>
              <Input
                id="section-title"
                placeholder="Ej: [Documento], [Pie de Pagina]"
                value={newSection.title}
                onChange={(e) => setNewSection({...newSection, title: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Sección</Label>
              <Select
                value={newSection.type}
                onValueChange={(val) => setNewSection({...newSection, type: val as 'single' | 'repeatable'})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Bloque Único (Encabezados/Globales)</SelectItem>
                  <SelectItem value="repeatable">Repetible (Lista de ítems/movimientos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newSection.type === 'repeatable' && (
              <div className="space-y-2">
                <Label>Origen de Datos Principal</Label>
                <Select
                  value={newSection.dataSource}
                  onValueChange={(val) => setNewSection({...newSection, dataSource: val as 'products' | 'movements'})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="products">Productos del Catálogo</SelectItem>
                    <SelectItem value="movements">Movimientos de Reconciliación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSectionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddSection} className="bg-indigo-600 hover:bg-indigo-700">Crear Grupo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
