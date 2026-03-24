import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MVTTemplate, MVTSection, FieldConfig } from "@/lib/ipv/mvt/types";
import { Settings2, Plus, Trash2, Edit2, Check } from "lucide-react";

interface TemplateEditorProps {
  template: MVTTemplate;
  onSave: (template: MVTTemplate) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave }) => {
  const [editedTemplate, setEditedTemplate] = useState<MVTTemplate>(JSON.parse(JSON.stringify(template)));
  const [isModified, setIsModified] = useState(false);

  const handleFieldChange = (sectionIndex: number, fieldIndex: number, updates: Partial<FieldConfig>) => {
    const newTemplate = { ...editedTemplate };
    newTemplate.sections[sectionIndex].fields[fieldIndex] = {
      ...newTemplate.sections[sectionIndex].fields[fieldIndex],
      ...updates
    };
    setEditedTemplate(newTemplate);
    setIsModified(true);
  };

  const handleSave = () => {
    onSave(editedTemplate);
    setIsModified(false);
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Configuración de Plantilla</CardTitle>
            <CardDescription>{editedTemplate.name}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isModified}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="w-4 h-4 mr-2" />
            Guardar Cambios
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Accordion type="multiple" className="w-full">
          {editedTemplate.sections.map((section, sIdx) => (
            <AccordionItem key={sIdx} value={`section-${sIdx}`}>
              <AccordionTrigger className="hover:no-underline py-2 px-3 bg-muted/50 rounded-lg mb-2">
                <span className="font-semibold text-sm">{section.title}</span>
              </AccordionTrigger>
              <AccordionContent className="pt-4 pb-2 px-1">
                <div className="space-y-4">
                  {section.fields.map((field, fIdx) => (
                    <div key={fIdx} className="grid grid-cols-12 gap-2 items-end border-b pb-3 border-dashed last:border-0">
                      <div className="col-span-3">
                        <Label className="text-[10px] uppercase text-muted-foreground">Campo</Label>
                        <Input
                          value={field.key}
                          className="h-8 text-xs font-mono"
                          onChange={(e) => handleFieldChange(sIdx, fIdx, { key: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[10px] uppercase text-muted-foreground">Origen</Label>
                        <select
                          className="w-full h-8 text-xs border rounded-md bg-background px-2"
                          value={field.source}
                          onChange={(e) => handleFieldChange(sIdx, fIdx, { source: e.target.value as any })}
                        >
                          <option value="static">Estático</option>
                          <option value="dynamic">Dinámico</option>
                          <option value="expression">Expresión</option>
                          <option value="template">Template</option>
                        </select>
                      </div>
                      <div className="col-span-5">
                        <Label className="text-[10px] uppercase text-muted-foreground">Valor / Path / Expresión</Label>
                        <Input
                          value={field.value}
                          className="h-8 text-xs font-mono"
                          onChange={(e) => handleFieldChange(sIdx, fIdx, { value: e.target.value })}
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full border-dashed h-8 text-xs">
                    <Plus className="w-3 h-3 mr-2" />
                    Añadir Campo
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};
