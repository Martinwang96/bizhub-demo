// 共享 className 拼接工具：把 falsy 值过滤掉，避免每个组件各自再写一遍。
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
