// src/components/ProductReceptionView.tsx
'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import type { Product } from '@/types';
import { toast } from 'sonner';
import { X, Save, Search, Plus, Trash2, Package } from 'lucide-react';
import { getProductImageUrl, cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface ProductReceptionViewProps {
    onCancel: () => void;
}

interface ReceptionItem {
    product: Product;
    quantity: number;
    cost: number;
    batch?: string;
    expiresAt?: string;
}

export default function ProductReceptionView({ onCancel }: ProductReceptionViewProps) {
    const { user } = useAuthStore();
    const [receptionItems, setReceptionItems] = useState<Map<string, ReceptionItem>>(new Map());
    const [receptionDetails, setReceptionDetails] = useState({
        supplier: '',
        invoiceNumber: '',
        receptionDate: new Date().toISOString().split('T')[0],
    });

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Search for products to add to the reception
    const searchProducts = useCallback(async () => {
        if (!debouncedSearchTerm) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const { data, error } = await supabase.rpc('get_paginated_products', {
                p_limit: 5,
                p_offset: 0,
                p_store_id: user?.store_id,
                p_search_term: debouncedSearchTerm
            });
            if (error) throw error;
            setSearchResults(data || []);
        } catch (error: any) {
            toast.error('Product search failed: ' + error.message);
        } finally {
            setIsSearching(false);
        }
    }, [debouncedSearchTerm, user?.store_id]);

    useEffect(() => {
        searchProducts();
    }, [searchProducts]);

    const addToReception = (product: Product) => {
        if (receptionItems.has(product.id)) {
            toast.info(`${product.name} is already in the reception list.`);
            return;
        }
        const newItems = new Map(receptionItems);
        newItems.set(product.id, {
            product,
            quantity: 1,
            cost: product.cost_price || 0,
        });
        setReceptionItems(newItems);
        setSearchTerm('');
        setSearchResults([]);
    };

    const updateReceptionItem = (productId: string, field: keyof ReceptionItem, value: any) => {
        const newItems = new Map(receptionItems);
        const item = newItems.get(productId);
        if (item) {
            (item[field] as any) = value;
            newItems.set(productId, item);
            setReceptionItems(newItems);
        }
    };

    const removeReceptionItem = (productId: string) => {
        const newItems = new Map(receptionItems);
        newItems.delete(productId);
        setReceptionItems(newItems);
    };

    const totalCost = useMemo(() => {
        return Array.from(receptionItems.values()).reduce((acc, item) => acc + (item.quantity * item.cost), 0);
    }, [receptionItems]);

    const processReception = async () => {
        if (receptionItems.size === 0) {
            toast.error('Add at least one product to the reception.');
            return;
        }
        if (!user?.store_id || !user?.id) {
            toast.error('Store or session error.');
            return;
        }
        if (!receptionDetails.supplier || !receptionDetails.invoiceNumber) {
            toast.error('Please complete supplier and invoice number.');
            return;
        }

        setIsProcessing(true);
        const toastId = toast.loading('Registering reception...');

        const itemsPayload = Array.from(receptionItems.values()).map(item => ({
            product_id: item.product.id,
            quantity: item.quantity,
            unit_cost: item.cost
        }));

        try {
             const { error } = await supabase.rpc('register_reception', {
                p_store_id: user.store_id,
                p_supplier: receptionDetails.supplier,
                p_reception_date: receptionDetails.receptionDate,
                p_invoice_number: receptionDetails.invoiceNumber,
                p_items: itemsPayload,
                p_user_id: user.id
            });

            if (error) throw error;

            toast.success('Reception registered successfully!', { id: toastId });
            onCancel(); // Return to the main inventory view
        } catch (err: any) {
            toast.error(err.message || 'Failed to process reception.', { id: toastId });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="pb-28 md:pb-0 relative">
            <h2 className="text-2xl font-bold border-l-4 border-primary pl-4 mb-6">
                New Product Reception
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                {/* Left side: Form and Items List */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Reception Details Form */}
                    <div className="neu-card !p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-muted-foreground uppercase">Supplier</label>
                                <input
                                    type="text"
                                    value={receptionDetails.supplier}
                                    onChange={(e) => setReceptionDetails({ ...receptionDetails, supplier: e.target.value })}
                                    className="neu-input w-full mt-1 text-base"
                                    placeholder="Supplier Name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase">Date</label>
                                    <input
                                        type="date"
                                        value={receptionDetails.receptionDate}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, receptionDate: e.target.value })}
                                        className="neu-input w-full mt-1 text-base"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-muted-foreground uppercase">Invoice #</label>
                                    <input
                                        type="text"
                                        value={receptionDetails.invoiceNumber}
                                        onChange={(e) => setReceptionDetails({ ...receptionDetails, invoiceNumber: e.target.value })}
                                        className="neu-input w-full mt-1 text-base"
                                        placeholder="INV-123"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Product Search */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search product to add..."
                            className="neu-input w-full pl-12 text-base"
                        />
                        {debouncedSearchTerm && (
                            <div className="absolute top-full left-0 w-full mt-2 neu-card z-10 max-h-60 overflow-y-auto">
                                {isSearching ? (
                                    <div className="p-4 text-center">Loading...</div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(p => (
                                        <div key={p.id} onClick={() => addToReception(p)} className="p-3 hover:bg-primary/10 cursor-pointer flex justify-between items-center">
                                            <span>{p.name}</span>
                                            <Plus className="w-5 h-5" />
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-muted-foreground">No results found.</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Reception Items List */}
                    <div className="space-y-3">
                        {Array.from(receptionItems.values()).map(({ product, quantity, cost }) => (
                            <div key={product.id} className="neu-card !p-3 grid grid-cols-12 gap-3 items-center">
                                <div className="col-span-4 font-bold text-sm truncate">{product.name}</div>
                                <div className="col-span-2">
                                     <input
                                        type="number"
                                        value={quantity}
                                        onChange={(e) => updateReceptionItem(product.id, 'quantity', parseInt(e.target.value) || 0)}
                                        className="neu-inset-sm w-full text-center font-bold !py-1 text-base"
                                    />
                                </div>
                               <div className="col-span-3">
                                     <input
                                        type="number"
                                        value={cost}
                                        step="0.01"
                                        onChange={(e) => updateReceptionItem(product.id, 'cost', parseFloat(e.target.value) || 0)}
                                        className="neu-inset-sm w-full text-center font-bold !py-1 text-base"
                                    />
                                </div>
                                <div className="col-span-2 text-right font-bold text-primary">
                                    ${(quantity * cost).toFixed(2)}
                                </div>
                                <div className="col-span-1 flex justify-end">
                                    <button onClick={() => removeReceptionItem(product.id)} className="p-2 hover:bg-danger/10 rounded-full">
                                        <Trash2 className="w-4 h-4 text-danger" />
                                    </button>
                                </div>
                            </div>
                        ))}
                         {receptionItems.size === 0 && (
                            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-white/10 rounded-xl">
                                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-bold">Your reception list is empty.</p>
                                <p className="text-sm">Use the search bar above to add products.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right side: Summary */}
                <div className="lg:col-span-1 w-full lg:sticky top-24">
                     <div className="neu-card border-primary/20 bg-primary/5 space-y-4">
                         <h3 className="font-bold text-lg text-primary">Reception Summary</h3>
                         <div className="flex justify-between items-center">
                             <span className="text-muted-foreground font-bold">Total Items</span>
                             <span className="font-black text-xl">{receptionItems.size}</span>
                         </div>
                         <div className="flex justify-between items-center text-2xl pt-4 border-t border-primary/20">
                             <span className="font-bold">Total Cost</span>
                             <span className="font-black text-primary">${totalCost.toFixed(2)}</span>
                         </div>
                     </div>
                </div>
            </div>

            {/* Sticky Footer for Actions */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md p-4 border-t border-white/5 md:hidden">
                 <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="neu-btn flex-1 py-4 font-bold uppercase tracking-wider"
                    >
                        Cancel
                    </button>
                     <button
                        onClick={processReception}
                        disabled={isProcessing}
                        className="neu-btn-primary flex-1 py-4 font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                        <Save className="w-5 h-5" />
                        {isProcessing ? 'Saving...' : 'Confirm'}
                    </button>
                 </div>
            </div>
             {/* Action buttons for desktop */}
            <div className="hidden md:flex justify-end gap-4 mt-8">
                <button
                    onClick={onCancel}
                    className="neu-btn px-8 py-3 font-bold uppercase"
                >
                    Cancel
                </button>
                <button
                    onClick={processReception}
                    disabled={isProcessing}
                    className="neu-btn-primary px-8 py-3 font-bold uppercase flex items-center gap-2"
                >
                    <Save className="w-5 h-5" />
                    {isProcessing ? 'Saving...' : 'Confirm Reception'}
                </button>
            </div>
        </div>
    );
}
