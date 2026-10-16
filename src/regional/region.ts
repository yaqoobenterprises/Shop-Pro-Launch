import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export interface ShopRegion {
  currency: string;
  currencySymbol: string;
  timeZone: string;
  country?: string;
  uiLanguage: 'en' | 'ur';
}

export const DEFAULT_REGION: ShopRegion = {
  currency: 'PKR',
  currencySymbol: 'Rs.',
  timeZone: 'Asia/Karachi',
  country: 'Pakistan',
  uiLanguage: 'en',
};

let moduleCurrentRegion: ShopRegion = { ...DEFAULT_REGION };

export function getModuleRegion(): ShopRegion {
  return moduleCurrentRegion;
}

export function setModuleRegion(patch: Partial<ShopRegion>): void {
  moduleCurrentRegion = {
    ...moduleCurrentRegion,
    ...patch,
  };
}

export function resetModuleRegion(): void {
  moduleCurrentRegion = { ...DEFAULT_REGION };
}

function getCachedRegion(orgId?: string): Partial<ShopRegion> | null {
  if (!orgId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`shop-pro:region:${orgId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function setCachedRegion(orgId: string, region: ShopRegion): void {
  if (!orgId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`shop-pro:region:${orgId}`, JSON.stringify(region));
  } catch {
    // Ignore storage write errors
  }
}

interface RegionContextType {
  region: ShopRegion;
  setRegion: (patch: Partial<ShopRegion>) => void;
}

const RegionContext = createContext<RegionContextType>({
  region: DEFAULT_REGION,
  setRegion: () => {},
});

export interface RegionProviderProps {
  children: React.ReactNode;
  organizationId?: string;
  currency?: string;
  currencySymbol?: string;
  timeZone?: string;
  country?: string;
  uiLanguage?: 'en' | 'ur';
}

export const RegionProvider: React.FC<RegionProviderProps> = ({
  children,
  organizationId,
  currency,
  currencySymbol,
  timeZone,
  country,
  uiLanguage,
}) => {
  const [region, setLocalRegion] = useState<ShopRegion>(() => {
    const cached = getCachedRegion(organizationId);
    const initial: ShopRegion = {
      currency: currency || cached?.currency || DEFAULT_REGION.currency,
      currencySymbol: currencySymbol || cached?.currencySymbol || DEFAULT_REGION.currencySymbol,
      timeZone: timeZone || cached?.timeZone || DEFAULT_REGION.timeZone,
      country: country || cached?.country || DEFAULT_REGION.country,
      uiLanguage: uiLanguage || cached?.uiLanguage || DEFAULT_REGION.uiLanguage,
    };
    setModuleRegion(initial);
    return initial;
  });

  useEffect(() => {
    const updated: ShopRegion = {
      currency: currency || region.currency || DEFAULT_REGION.currency,
      currencySymbol: currencySymbol || region.currencySymbol || DEFAULT_REGION.currencySymbol,
      timeZone: timeZone || region.timeZone || DEFAULT_REGION.timeZone,
      country: country || region.country || DEFAULT_REGION.country,
      uiLanguage: uiLanguage || region.uiLanguage || DEFAULT_REGION.uiLanguage,
    };
    setLocalRegion(updated);
    setModuleRegion(updated);
    if (organizationId) {
      setCachedRegion(organizationId, updated);
    }
  }, [organizationId, currency, currencySymbol, timeZone, country, uiLanguage]);

  const setRegion = (patch: Partial<ShopRegion>) => {
    setLocalRegion((prev) => {
      const next = { ...prev, ...patch };
      setModuleRegion(next);
      if (organizationId) {
        setCachedRegion(organizationId, next);
      }
      return next;
    });
  };

  const contextValue = useMemo(() => ({ region, setRegion }), [region]);

  return React.createElement(RegionContext.Provider, { value: contextValue }, children);
};

export function useRegion(): RegionContextType {
  return useContext(RegionContext);
}
