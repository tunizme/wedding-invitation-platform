'use client';
import { createContext } from 'react';
export const ManagedAssetsContext = createContext<string | undefined>(
  undefined,
);
