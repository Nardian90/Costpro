import { ReactNode } from 'react';

export type FeatureStatus = 'active' | 'beta' | 'pro-locked' | 'hidden';

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name or similar
  path: string;
  status: FeatureStatus;
  isPro: boolean;
  module: string; // 'ipv' | 'costs' | 'multistore' | 'core'
  order: number;
}
