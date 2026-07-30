'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BookOpen,
  Search,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Zap,
  Database,
  GraduationCap,
  FileText,
  Users,
  RefreshCw,
  Activity,
  Globe,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OpenAPIResponse {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
}

interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: Record<string, unknown>;
  }>;
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: Record<string, unknown>; example?: unknown }>;
  };
  responses?: Record<string, {
    description?: string;
    content?: Record<string, { schema?: Record<string, unknown> }>;
  }>;
  security?: Array<Record<string, string[]>>;
  'x-rate-limit'?: string;
}

const METHOD_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  get:    { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'GET' },
  post:   { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'POST' },
  put:    { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', label: 'PUT' },
  patch:  { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', label: 'PATCH' },
  delete: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', label: 'DELETE' },
};

const TAG_ICONS: Record<string, React.ElementType> = {
  System: Activity,
  AI: Zap,
  CostSheets: FileText,
  Academy: GraduationCap,
  Inventory: Database,
  Reports: Globe,
  Users: Users,
  Sync: RefreshCw,
  Other: BookOpen,
};

const TAG_COLORS: Record<string, string> = {
  System: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  AI: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  CostSheets: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  Academy: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  Inventory: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  Reports: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  Users: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  Sync: 'bg-lime-500/10 text-lime-600 dark:text-lime-400',
  Other: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ApiDocsViewer() {
  const [spec, setSpec] = useState<OpenAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch spec
  useEffect(() => {
    async function fetchSpec() {
      try {
        const res = await fetch('/api/docs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSpec(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load API docs');
      } finally {
        setLoading(false);
      }
    }
    fetchSpec();
  }, []);

  // Group endpoints by tag
  const endpointsByTag = useMemo(() => {
    if (!spec) return {};

    const groups: Record<string, Array<{ method: string; path: string; operation: Operation }>> = {};
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const method of httpMethods) {
        const operation = (methods as Record<string, Operation>)[method];
        if (!operation) continue;

        const tag = operation.tags?.[0] || 'Other';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push({ method, path, operation });
      }
    }

    // Sort within each tag
    for (const tag of Object.keys(groups)) {
      groups[tag].sort((a, b) => a.path.localeCompare(b.path));
    }

    return groups;
  }, [spec]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return endpointsByTag;
    const q = search.toLowerCase();

    const result: Record<string, Array<{ method: string; path: string; operation: Operation }>> = {};
    for (const [tag, endpoints] of Object.entries(endpointsByTag)) {
      const filtered = endpoints.filter(
        ({ path, operation }) =>
          path.toLowerCase().includes(q) ||
          operation.summary?.toLowerCase().includes(q) ||
          operation.operationId?.toLowerCase().includes(q) ||
          operation.description?.toLowerCase().includes(q) ||
          tag.toLowerCase().includes(q),
      );
      if (filtered.length > 0) result[tag] = filtered;
    }
    return result;
  }, [endpointsByTag, search]);

  // Count total endpoints
  const totalEndpoints = useMemo(() => {
    return Object.values(endpointsByTag).reduce((acc, arr) => acc + arr.length, 0);
  }, [endpointsByTag]);

  const togglePath = useCallback((pathKey: string) => {
    setExpandedPaths((prev) =>
      prev.includes(pathKey) ? prev.filter((p) => p !== pathKey) : [...prev, pathKey],
    );
  }, []);

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  // ─── Render helpers ───────────────────────────────────────────────

  function renderSchema(schema: Record<string, unknown>, depth = 0): React.ReactNode {
    if (!schema || Object.keys(schema).length === 0) return null;

    if (schema.$ref) {
      const name = String(schema.$ref).split('/').pop();
      return (
        <span className="font-mono text-xs text-sky-500 cursor-pointer hover:underline" title={String(schema.$ref)}>
          {name}
        </span>
      );
    }

    if (schema.type === 'string') {
      const parts: React.ReactNode[] = [<span key="type" className="text-emerald-600">string</span>];
      if (schema.format) parts.push(<span key="fmt" className="text-muted-foreground"> ({String(schema.format)})</span>);
      if (schema.enum) parts.push(<span key="enum" className="text-muted-foreground"> enum: [{(schema.enum as string[]).join(', ')}]</span>);
      if (schema.minLength) parts.push(<span key="min" className="text-muted-foreground"> min: {String(schema.minLength)}</span>);
      if (schema.maxLength) parts.push(<span key="max" className="text-muted-foreground"> max: {String(schema.maxLength)}</span>);
      return <>{parts}</>;
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      const parts: React.ReactNode[] = [<span key="type" className="text-amber-600">{String(schema.type)}</span>];
      if (schema.minimum != null) parts.push(<span key="min" className="text-muted-foreground"> min: {String(schema.minimum)}</span>);
      if (schema.maximum != null) parts.push(<span key="max" className="text-muted-foreground"> max: {String(schema.maximum)}</span>);
      return <>{parts}</>;
    }

    if (schema.type === 'boolean') return <span className="text-rose-600">boolean</span>;
    if (schema.type === 'array') {
      return (
        <span>
          array[<span className="text-muted-foreground">{renderSchema((schema.items as Record<string, unknown>) || {}, depth + 1)}</span>]
        </span>
      );
    }

    if (schema.type === 'object' && schema.properties) {
      return (
        <div className={`${depth > 0 ? 'ml-4 border-l border-muted pl-2' : ''}`}>
          <span className="text-muted-foreground">{'{ '}</span>
          <ul className="space-y-1 my-1">
            {Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([key, val]) => (
              <li key={key} className="text-xs flex items-start gap-1">
                <span className="font-mono text-foreground/80">{key}</span>
                {(schema.required as string[])?.includes(key) && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-3 text-rose-500 border-rose-500/30">required</Badge>
                )}
                <span className="text-muted-foreground">:</span> {renderSchema(val, depth + 1)}
              </li>
            ))}
          </ul>
          <span className="text-muted-foreground">{'}'}</span>
        </div>
      );
    }

    if (schema.oneOf || schema.anyOf) {
      const entries = (schema.oneOf || schema.anyOf) as Record<string, unknown>[];
      return (
        <div className={`${depth > 0 ? 'ml-4 border-l border-muted pl-2' : ''}`}>
          <span className="text-muted-foreground">{schema.oneOf ? 'oneOf' : 'anyOf'}:</span>
          <ul className="space-y-1 my-1">
            {entries.map((e, i) => (
              <li key={i} className="text-xs pl-2">• {renderSchema(e, depth + 1)}</li>
            ))}
          </ul>
        </div>
      );
    }

    return <span className="text-muted-foreground text-xs">{JSON.stringify(schema)}</span>;
  }

  function renderStatusCode(code: string, response: { description?: string; content?: Record<string, { schema?: Record<string, unknown> }> }) {
    const isOk = code.startsWith('2');
    const isErr = code.startsWith('4') || code.startsWith('5');
    return (
      <div key={code} className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={isOk ? 'default' : 'destructive'} className="text-xs font-mono h-5">
            {code}
          </Badge>
          <span className="text-xs text-muted-foreground">{response.description}</span>
        </div>
        {response.content && Object.entries(response.content).map(([ct, data]) => (
          <div key={ct} className="ml-4 pl-2 border-l border-muted">
            <span className="text-[10px] text-muted-foreground font-mono">{ct}</span>
            {data.schema && <div className="mt-1">{renderSchema(data.schema)}</div>}
          </div>
        ))}
      </div>
    );
  }

  // ─── Loading / Error states ───────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="m-4 md:m-6">
        <CardContent className="p-6">
          <div className="text-destructive font-medium">Failed to load API documentation</div>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!spec) return null;

  // ─── Main render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{spec.info.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="font-mono text-xs">v{spec.info.version}</Badge>
                <Badge variant="outline" className="font-mono text-xs">OpenAPI {spec.openapi}</Badge>
                <Badge variant="outline" className="text-xs">{totalEndpoints} endpoints</Badge>
                <Badge variant="outline" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Auth required
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(JSON.stringify(spec, null, 2), 'full-spec')}
          >
            {copiedId === 'full-spec' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            Copy Full Spec
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search endpoints by name, path, or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Rate limit info */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Rate Limits:</span>
            <span>Standard: <Badge variant="outline" className="text-xs">30 req/min</Badge></span>
            <span>AI Routes: <Badge variant="outline" className="text-xs text-amber-600">10 req/min</Badge></span>
            <span>Cost Engine: <Badge variant="outline" className="text-xs text-emerald-600">60 req/min</Badge></span>
          </div>
        </CardContent>
      </Card>

      {/* Tag groups */}
      {Object.entries(filteredGroups).map(([tagName, endpoints]) => {
        const Icon = TAG_ICONS[tagName] || BookOpen;
        const colorClass = TAG_COLORS[tagName] || '';

        return (
          <Card key={tagName}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <CardTitle className="text-lg">{tagName}</CardTitle>
                <Badge variant="secondary" className="ml-auto text-xs">{endpoints.length}</Badge>
                <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
                  {spec.tags.find((t) => t.name === tagName)?.description}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {endpoints.map(({ method, path, operation }) => {
                  const pathKey = `${method}:${path}`;
                  const isExpanded = expandedPaths.includes(pathKey);
                  const methodInfo = METHOD_COLORS[method] || METHOD_COLORS.get;
                  const responseCodes = operation.responses ? Object.keys(operation.responses) : [];
                  const hasAuth = operation.security !== undefined || method !== 'get';
                  const needsAdmin = operation.tags?.some((t) => t === 'Users');

                  return (
                    <div
                      key={pathKey}
                      className={`rounded-lg border transition-all duration-200 ${
                        isExpanded ? 'border-primary/30 shadow-sm' : 'border-border hover:border-muted-foreground/20'
                      }`}
                    >
                      {/* Endpoint header */}
                      <button
                        onClick={() => togglePath(pathKey)}
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 rounded-lg transition-colors"
                      >
                        <span className={`font-mono text-xs font-bold px-2 py-1 rounded ${methodInfo.bg} ${methodInfo.text}`}>
                          {methodInfo.label}
                        </span>
                        <span className="font-mono text-sm font-medium text-foreground flex-1 truncate">
                          {path}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {needsAdmin && (
                            <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-500/30">
                              Admin
                            </Badge>
                          )}
                          {hasAuth && !needsAdmin && (
                            <Badge variant="outline" className="text-[10px] h-5">
                              <Shield className="h-3 w-3 mr-0.5" />
                              Auth
                            </Badge>
                          )}
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3">
                          <Separator />

                          {/* Summary & description */}
                          {operation.summary && (
                            <p className="text-sm font-medium">{operation.summary}</p>
                          )}
                          {operation.description && (
                            <p className="text-xs text-muted-foreground whitespace-pre-line">{operation.description}</p>
                          )}

                          {/* Parameters */}
                          {operation.parameters && operation.parameters.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Parameters</h4>
                              <div className="space-y-1">
                                {operation.parameters.map((param) => (
                                  <div key={param.name} className="flex items-start gap-2 text-xs">
                                    <Badge variant={param.required ? 'default' : 'outline'} className="text-[10px] h-4 px-1">
                                      {param.in}
                                    </Badge>
                                    <span className="font-mono font-medium">{param.name}</span>
                                    {param.required && <span className="text-rose-500">*</span>}
                                    {param.description && (
                                      <span className="text-muted-foreground">— {param.description}</span>
                                    )}
                                    {param.schema?.type != null && (
                                      <span className="text-muted-foreground font-mono ml-auto">
                                        ({String(param.schema.type)}{param.schema.format ? `: ${String(param.schema.format)}` : ''})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Request body */}
                          {operation.requestBody && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                                Request Body
                                {operation.requestBody.required && <span className="text-rose-500 ml-1">*</span>}
                              </h4>
                              <ScrollArea className="max-h-64">
                                {Object.entries(operation.requestBody.content || {}).map(([ct, data]) => (
                                  <div key={ct} className="mb-2">
                                    <span className="text-[10px] text-muted-foreground font-mono">{ct}</span>
                                    {data.schema && (
                                      <div className="mt-1 bg-muted/30 rounded p-2">{renderSchema(data.schema)}</div>
                                    )}
                                    {data.example != null && (
                                      <div className="mt-1">
                                        <button
                                          onClick={() => copyToClipboard(JSON.stringify(data.example, null, 2), `example-${pathKey}`)}
                                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 mb-1"
                                        >
                                          {copiedId === `example-${pathKey}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                          Copy example
                                        </button>
                                        <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-x-auto font-mono max-h-48">
                                          {JSON.stringify(data.example, null, 2)}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </ScrollArea>
                            </div>
                          )}

                          {/* Responses */}
                          {responseCodes.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Responses</h4>
                              <Accordion type="multiple" className="w-full">
                                {responseCodes.map((code) => {
                                  const resp = operation.responses![code];
                                  if (!resp) return null;
                                  const isOk = code.startsWith('2');
                                  return (
                                    <AccordionItem key={code} value={code}>
                                      <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
                                        <div className="flex items-center gap-2">
                                          <Badge variant={isOk ? 'default' : 'destructive'} className="text-[10px] h-5 font-mono">
                                            {code}
                                          </Badge>
                                          <span className="text-muted-foreground text-xs">{resp.description}</span>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent className="pb-2">
                                        <ScrollArea className="max-h-48">
                                          {resp.content && Object.entries(resp.content).map(([ct, data]) => (
                                            <div key={ct}>
                                              <span className="text-[10px] text-muted-foreground font-mono">{ct}</span>
                                              {data.schema && (
                                                <div className="mt-1 bg-muted/30 rounded p-2">{renderSchema(data.schema)}</div>
                                              )}
                                            </div>
                                          ))}
                                        </ScrollArea>
                                      </AccordionContent>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            </div>
                          )}

                          {/* Operation ID */}
                          {operation.operationId && (
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                              <span>operationId:</span>
                              <code className="font-mono bg-muted/40 px-1 rounded">{operation.operationId}</code>
                              <button
                                onClick={() => copyToClipboard(operation.operationId!, `opid-${pathKey}`)}
                                className="hover:text-foreground"
                              >
                                {copiedId === `opid-${pathKey}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Footer */}
      <Card className="bg-muted/20">
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          <p>CostPro Enterprise API Documentation — Generated dynamically from source code</p>
          <p className="mt-1">
            Spec available at{' '}
            <code className="font-mono bg-muted/40 px-1 rounded">GET /api/docs</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
