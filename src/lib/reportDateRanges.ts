import { getKarachiBusinessDate } from "./dates";

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

export const getWeekRangeForDate = (value: string): [string, string] => {
  const [year, month, day] = value.split("-").map(Number);
  const selected = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(selected);
  start.setUTCDate(start.getUTCDate() - ((selected.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const today = getKarachiBusinessDate();
  const endDate = isoDate(end);
  return [isoDate(start), endDate > today ? today : endDate];
};
