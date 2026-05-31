'use client';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DesktopExperience } from '@/components/shells/desktop-experience';
import { MobileApp } from '@/components/shells/mobile-app';
import type { TrackerSnapshot } from '@/lib/tracker/types';

export function TrackerRoot({ snapshot }: { snapshot: TrackerSnapshot }) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  return isDesktop ? <DesktopExperience snapshot={snapshot} /> : <MobileApp snapshot={snapshot} />;
}
