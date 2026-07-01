'use client';

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
}

const emptySubscribe = () => () => {};

export const Portal: React.FC<PortalProps> = ({ children }) => {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) return null;

  return createPortal(children, document.body);
};
