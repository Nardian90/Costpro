import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MVTTemplate, MVTSection, FieldConfig, FieldSource } from "@/lib/ipv/mvt/types";
import { STANDARD_MVT_TEMPLATE } from "@/lib/ipv/mvt/defaults";
import { db } from "@/lib/dexie";
import {
  Settings2, Plus, Trash2, Check, GripVertical,
  ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine,
  PlusCircle, Copy, AlertCircle, Pencil
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

interface TemplateEditorProps {
  template: MVTTemplate;
  onSave: (template: MVTTemplate) => void;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15);
};

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
  const isReadOnly = template.id === STANDARD_MVT_TEMPLATE.id;

  const ensureIds = (t: MVTTemplate): MVTTemplate => {
    const newT = JSON.parse(JSON.stringify(t));
    newT.sections = newT.sections.map((s: MVTSection) => ({
      ...s,
      _id: s._id || generateId(),
      fields: s.fields.map((f: FieldConfig) => ({
        ...f,
        _id: f._id || generateId()
      }))
    }));
    return newT;
  };

  const [editedTemplate, setEditedTemplate] = useState<MVTTemplate>(ensureIds(template));
  const [isModified, setIsModified] = useState(false);

  useEffect(() => {
    setEditedTemplate(ensureIds(template));
    setIsModified(false);
  }, [template.id]);

  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState<number | null>(null);

  const [newField, setNewField] = useState<FieldConfig>({
    key: '',
    source: 'static',
    value: ''
  });

  const [newSection, setNewSection] = useState<Partial<MVTSection>>({
    title: '',
    type: 'single',
    fields: [],
    dataSource: 'products'
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFieldChange = (sectionIndex: number, fieldIndex: number, updates: Partial<FieldConfig>) => {
    if (isReadOnly) return;
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[sectionIndex].fields[fieldIndex] = {
      ...newTemplate.sections[sectionIndex].fields[fieldIndex],
      ...updates
    };
    setEditedTemplate(newTemplate);
    setIsModified(true);
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    if (isReadOnly) return;
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[sectionIndex].fields.splice(fieldIndex, 1);
    setEditedTemplate(newTemplate);
    setIsModified(true);
    toast.info("Campo eliminado");
  };

  const removeSection = (sectionIndex: number) => {
    if (isReadOnly) return;
    const newTemplate = { ...editedTemplate };
    newTemplate.sections.splice(sectionIndex, 1);
    setEditedTemplate(newTemplate);
    setIsModified(true);
    toast.info("Sección eliminada");
  };

  const handleAddField = () => {
    if (isReadOnly || currentSectionIndex === null) return;
    if (!newField.key) {
      toast.error("El nombre del campo es obligatorio");
      return;
    }
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[currentSectionIndex].fields.push({ ...newField, _id: generateId() });
    setEditedTemplate(newTemplate);
    setIsModified(true);
    setIsFieldDialogOpen(false);
    setNewField({ key: '', source: 'static', value: '' });
    toast.success("Campo añadido");
  };

  const handleAddSection = () => {
    if (isReadOnly) return;
    if (!newSection.title) {
      toast.error("Título obligatorio");
      return;
    }
    const newTemplate = { ...editedTemplate };
    newTemplate.sections.push({
      title: newSection.title,
      type: newSection.type as 'single' | 'repeatable',
      fields: [],
      dataSource: newSection.dataSource as 'products' | 'movements',
      _id: generateId()
    });
    setEditedTemplate(newTemplate);
    setIsModified(true);
    setIsSectionDialogOpen(false);
    setNewSection({ title: '', type: 'single', fields: [], dataSource: 'products' });
    toast.success("Sección añadida");
  };

  const moveField = (sectionIndex: number, fromIndex: number, toIndex: number) => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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

  const handleDuplicate = async () => {
    try {
      const newTemplate: MVTTemplate = {
        ...JSON.parse(JSON.stringify(editedTemplate)),
        id: crypto.randomUUID(),
        name: `Copia de ${editedTemplate.name}`,
        isDefault: false
      };
      await db.mvt_templates.add(newTemplate);
      toast.success("Plantilla duplicada y lista para editar");
      onSave(newTemplate);
    } catch (error) {
      console.error(error);
      toast.error("Error al duplicar la plantilla");
    }
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Pencil className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold uppercase tracking-tight">Estructura MVT</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {editedTemplate.name}
                {isReadOnly && <Badge variant="secondary" className="text-[10px] h-4">Sistema</Badge>}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDuplicate} className="h-9">
              <Copy className="w-4 h-4 mr-2" /> Duplicar
            </Button>
            {!isReadOnly && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsSectionDialogOpen(true)} className="h-9">
                  <PlusCircle className="w-4 h-4 mr-2" /> Grupo
                </Button>
                <Button size="sm" onClick={() => onSave(editedTemplate)} disabled={!isModified} className="bg-emerald-600 hover:bg-emerald-700 h-9">
                  <Check className="w-4 h-4 mr-2" /> Guardar
                </Button>
              </>
            )}
          </div>
        </div>

        {isReadOnly && (
          <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0" />
            <p className="text-xs text-indigo-800 leading-relaxed">
              Esta es una <strong>plantilla de sistema</strong> y no puede ser modificada directamente.
              Usa el botón <strong>Duplicar</strong> para crear una copia personalizable.
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndSections}>
          <SortableContext items={editedTemplate.sections.map(s => s._id!)} strategy={verticalListSortingStrategy}>
            <Accordion type="multiple" className="space-y-3">
              {editedTemplate.sections.map((section, sIdx) => (
                <SortableItem key={section._id} id={section._id!}>
                  <AccordionItem value={section._id!} className="border rounded-xl bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center bg-slate-50/80 pr-2">
                      <AccordionTrigger className="py-3 px-4 flex-1 hover:no-underline">
                        <div className="flex items-center gap-3">
                          <Settings2 className="w-4 h-4 text-indigo-500" />
                          <span className="font-bold text-sm text-slate-700 uppercase">{section.title}</span>
                          <Badge variant="outline" className="text-[9px] uppercase font-normal">
                            {section.type === 'repeatable' ? `Repetible (${section.dataSource})` : 'Único'}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      {!isReadOnly && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, 0)}><ArrowUpToLine className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, sIdx - 1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, sIdx + 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveSection(sIdx, editedTemplate.sections.length - 1)}><ArrowDownToLine className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeSection(sIdx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </div>
                    <AccordionContent className="p-4 bg-white">
                      <div className="space-y-4">
                        {!isReadOnly && (
                           <div className="grid grid-cols-2 gap-4 pb-4 border-b border-dashed">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-400">Título del Grupo</Label>
                                <Input
                                  value={section.title}
                                  className="h-9 text-sm font-semibold"
                                  onChange={(e) => {
                                    const newT = {...editedTemplate};
                                    newT.sections[sIdx].title = e.target.value;
                                    setEditedTemplate(newT);
                                    setIsModified(true);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-400">Tipo de Datos</Label>
                                <Select
                                  value={section.type}
                                  onValueChange={(val) => {
                                    const newT = {...editedTemplate};
                                    newT.sections[sIdx].type = val as 'single' | 'repeatable';
                                    setEditedTemplate(newT);
                                    setIsModified(true);
                                  }}
                                >
                                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single">Bloque Único</SelectItem>
                                    <SelectItem value="repeatable">Repetible</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                           </div>
                        )}

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndFields(e, sIdx)}>
                          <SortableContext items={section.fields.map(f => f._id!)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-2">
                              {section.fields.map((field, fIdx) => (
                                <SortableItem key={field._id} id={field._id!}>
                                  <div className="grid grid-cols-12 gap-3 items-end p-3 rounded-lg border bg-slate-50/30 relative">
                                    <div className="col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400">Key</Label>
                                      <Input
                                        value={field.key}
                                        className="h-8 text-xs font-mono"
                                        readOnly={isReadOnly}
                                        onChange={(e) => handleFieldChange(sIdx, fIdx, { key: e.target.value })}
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400">Origen</Label>
                                      <Select
                                        value={field.source}
                                        disabled={isReadOnly}
                                        onValueChange={(val) => handleFieldChange(sIdx, fIdx, { source: val as FieldSource })}
                                      >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="static">Estático</SelectItem>
                                          <SelectItem value="dynamic">Dinámico</SelectItem>
                                          <SelectItem value="expression">Expresión</SelectItem>
                                          <SelectItem value="template">Template</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="col-span-4 md:col-span-3">
                                      <Label className="text-[10px] font-bold uppercase text-slate-400">Valor</Label>
                                      <Input
                                        value={field.value}
                                        className="h-8 text-xs font-mono"
                                        readOnly={isReadOnly}
                                        onChange={(e) => handleFieldChange(sIdx, fIdx, { value: e.target.value })}
                                      />
                                    </div>
                                    <div className="col-span-2 md:col-span-3 flex items-center justify-end">
                                      {!isReadOnly && (
                                        <>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(sIdx, fIdx, 0)}><ArrowUpToLine className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(sIdx, fIdx, fIdx - 1)}><ArrowUp className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(sIdx, fIdx, fIdx + 1)}><ArrowDown className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveField(sIdx, fIdx, section.fields.length - 1)}><ArrowDownToLine className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeField(sIdx, fIdx)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </SortableItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                        {!isReadOnly && (
                          <Button variant="outline" size="sm" className="w-full border-dashed border-slate-300 text-slate-500 hover:text-indigo-600 hover:border-indigo-200" onClick={() => { setCurrentSectionIndex(sIdx); setIsFieldDialogOpen(true); }}>
                            <Plus className="w-3.5 h-3.5 mr-2" /> Añadir Campo
                          </Button>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </SortableItem>
              ))}
            </Accordion>
          </SortableContext>
        </DndContext>
      </CardContent>

      <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Campo</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Nombre (Key)</Label>
              <Input value={newField.key} placeholder="Ej: CODIGO" onChange={(e) => setNewField({...newField, key: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Origen</Label>
              <Select value={newField.source} onValueChange={(val) => setNewField({...newField, source: val as FieldSource})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Estático</SelectItem>
                  <SelectItem value="dynamic">Dinámico</SelectItem>
                  <SelectItem value="expression">Expresión</SelectItem>
                  <SelectItem value="template">Template</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor / Path</Label>
              <Input value={newField.value} placeholder="Ej: product.cod o {cantidad} * 10" onChange={(e) => setNewField({...newField, value: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddField}>Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Grupo de Datos</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Título (Incluir corchetes si es necesario)</Label>
              <Input value={newSection.title} placeholder="Ej: [Nuevos_Datos]" onChange={(e) => setNewSection({...newSection, title: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newSection.type} onValueChange={(val) => setNewSection({...newSection, type: val as 'single' | 'repeatable'})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Bloque Único (Encabezados, etc)</SelectItem>
                  <SelectItem value="repeatable">Repetible (Filas de productos/movimientos)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newSection.type === 'repeatable' && (
              <div className="space-y-2">
                <Label>Fuente de Datos</Label>
                <Select value={newSection.dataSource} onValueChange={(val) => setNewSection({...newSection, dataSource: val as 'products' | 'movements'})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="products">Catálogo de Productos</SelectItem>
                    <SelectItem value="movements">Movimientos en el Rango</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleAddSection}>Crear Grupo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
