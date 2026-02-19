import sys

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'r') as f:
    content = f.read()

# Replace activeSection === 'main' block
old_main_block = """                    {activeSection === 'main' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            {(layoutMode === "grid") ? (
                                <CostSheetCardView
                                    sections={data?.sections || []}
                                    groupedSections={groupedSections}
                                    calculatedValues={calculatedValues}
                                    annexes={data?.annexes || []}
                                    activeSubSectionId={activeSubSectionId}
                                    setActiveSubSectionId={setActiveSubSectionId}
                                    onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                />
                            ) : (
                                <CostSheetInteractiveTable
                                    sections={data?.sections || []}
                                    groupedSections={groupedSections}
                                    calculatedValues={calculatedValues}
                                    annexes={data?.annexes || []}
                                    activeSubSectionId={activeSubSectionId}
                                    setActiveSubSectionId={setActiveSubSectionId}
                                    onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                />
                            )}
                        </div>
                    )}"""

new_main_block = """                    {(activeSection === 'main' || activeSection === 'all-content') && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            {activeSection === 'all-content' && (
                                <div className="px-4 py-6 mb-8 bg-primary/5 rounded-[2rem] border border-primary/10">
                                    <h2 className="text-2xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                        <Zap className="w-8 h-8" />
                                        Modo Experto: Vista Consolidada
                                    </h2>
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Todas las Secciones y Anexos</p>
                                </div>
                            )}

                            <LazyRender>
                                {(layoutMode === "grid") ? (
                                    <CostSheetCardView
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSection === 'all-content' ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                ) : (
                                    <CostSheetInteractiveTable
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={activeSection === 'all-content' ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                )}
                            </LazyRender>
                        </div>
                    )}"""

# Replace isAnnexActive block
old_annex_block = """                    {isAnnexActive && (
                        <CostSheetAnnexEditor
                            activeAnnexId={activeSection}
                            layoutMode={layoutMode}
                            calculatedAnnexes={calculatedAnnexes}
                        />
                    )}"""

new_annex_block = """                    {isAnnexActive && (
                        <div className="space-y-12">
                            {(activeSection === 'all-annexes' || activeSection === 'all-content') ? (
                                (data?.annexes || []).map((annex: any) => (
                                    <LazyRender key={annex.id}>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-3 px-4">
                                                <div className="w-2 h-8 bg-primary rounded-full" />
                                                <h3 className="text-xl font-black uppercase tracking-tighter italic">Anexo {annex.id}: {annex.title}</h3>
                                            </div>
                                            <CostSheetAnnexEditor
                                                activeAnnexId={annex.id}
                                                layoutMode={layoutMode}
                                                calculatedAnnexes={calculatedAnnexes}
                                            />
                                        </div>
                                    </LazyRender>
                                ))
                            ) : (
                                <CostSheetAnnexEditor
                                    activeAnnexId={activeSection}
                                    layoutMode={layoutMode}
                                    calculatedAnnexes={calculatedAnnexes}
                                />
                            )}
                        </div>
                    )}"""

content = content.replace(old_main_block, new_main_block)
content = content.replace(old_annex_block, new_annex_block)

with open('src/components/views/terminal/views/cost_sheet/CostSheetView.tsx', 'w') as f:
    f.write(content)
