import { FeatureDefinition } from './types';

class FeatureRegistry {
  private features: Map<string, FeatureDefinition> = new Map();

  register(feature: FeatureDefinition) {
    this.features.set(feature.id, feature);
  }

  getFeature(id: string): FeatureDefinition | undefined {
    return this.features.get(id);
  }

  getAllFeatures(): FeatureDefinition[] {
    return Array.from(this.features.values()).sort((a, b) => a.order - b.order);
  }

  getFeaturesByModule(module: string): FeatureDefinition[] {
    return this.getAllFeatures().filter(f => f.module === module);
  }
}

export const registry = new FeatureRegistry();

registry.register({
  id: 'terminal',
  name: 'Consola Central',
  description: 'Centro de mando y auditoría global',
  icon: 'Terminal',
  path: '/terminal',
  status: 'active',
  isPro: false,
  module: 'core',
  order: 0
});

registry.register({
  id: 'ipv',
  name: 'Protocolo IPV',
  description: 'Validación de Inventario y Pagos con IA',
  icon: 'Layers',
  path: '/ipv',
  status: 'active',
  isPro: false,
  module: 'ipv',
  order: 1
});

registry.register({
  id: 'costs',
  name: 'Fichas de Costo',
  description: 'Análisis de márgenes y simulación de precios',
  icon: 'Calculator',
  path: '/costs',
  status: 'pro-locked',
  isPro: true,
  module: 'costs',
  order: 2
});

registry.register({
  id: 'multistore',
  name: 'Multi-Tienda Pro',
  description: 'Gestión multi-sucursal y consolidación',
  icon: 'Building',
  path: '/multistore',
  status: 'pro-locked',
  isPro: true,
  module: 'multistore',
  order: 3
});

registry.register({
  id: 'pro-panel',
  name: 'Panel Pro',
  description: 'Configuración avanzada y automatizaciones',
  icon: 'Zap',
  path: '/pro-panel',
  status: 'pro-locked',
  isPro: true,
  module: 'core',
  order: 4
});
