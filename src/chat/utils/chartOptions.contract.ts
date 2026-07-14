import type { ChartKind } from '../types/chart';

type Assert<T extends true> = T;
type SupportedKind = 'bar' | 'line' | 'barLine' | 'rateCompare' | 'pie' | 'table';

export type ChartKindMatchesSupportedSet = Assert<
  ChartKind extends SupportedKind ? (SupportedKind extends ChartKind ? true : false) : false
>;

export const supportedChartKinds: ChartKind[] = ['bar', 'line', 'barLine', 'rateCompare', 'pie', 'table'];
