import type { Message } from '../types/session';
import type { ChartPayload } from '../types/chart';

export interface LatestChartResult {
  message: Message;
  chart: ChartPayload;
  messageIndex: number;
}

export interface ChartMessagePair {
  messageIndex: number;
  message: Message;
  chartIndex: number;
  chart: ChartPayload;
}

export function getLatestChartMessage(messages: Message[] | undefined | null): LatestChartResult | null {
  if (!messages?.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const chart = msg.charts?.[msg.charts.length - 1];
    if (chart) return { message: msg, chart, messageIndex: i };
  }
  return null;
}

/**
 * 获取对话中所有包含图表的消息及其图表列表（按时间正序）
 */
export function getAllChartMessages(messages: Message[] | undefined | null): ChartMessagePair[] {
  if (!messages?.length) return [];
  const pairs: ChartMessagePair[] = [];
  messages.forEach((msg, idx) => {
    if (msg.role !== 'assistant') return;
    if (!msg.charts?.length) return;
    msg.charts.forEach((chart, cidx) => {
      pairs.push({
        messageIndex: idx,
        message: msg,
        chartIndex: cidx,
        chart,
      });
    });
  });
  return pairs;
}

/**
 * 根据 chartId 查找对应的消息索引
 */
export function findChartMessageIndex(messages: Message[] | undefined | null, chartId: string): number {
  const pairs = getAllChartMessages(messages);
  const found = pairs.find((p) => p.chart.id === chartId);
  return found ? found.messageIndex : -1;
}

/**
 * 根据 chartId 获取 ChartPayload
 */
export function getChartById(messages: Message[] | undefined | null, chartId: string): ChartPayload | null {
  const pairs = getAllChartMessages(messages);
  const found = pairs.find((p) => p.chart.id === chartId);
  return found ? found.chart : null;
}
