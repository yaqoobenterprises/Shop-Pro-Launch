/** Compare a selected inclusive business-date window with the immediately preceding window of equal length. */
export function precedingPeriod(start: string, end: string): [string,string] {
  const millis = (value: string) => {
    const date = new Date(value+"T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error("Invalid business date.");
    return date.getTime();
  };
  const day = 86400000, from=millis(start), to=millis(end);
  if (to < from) throw new Error("Invalid comparison window.");
  const length = to-from+day;
  return [new Date(from-length).toISOString().slice(0,10),new Date(from-day).toISOString().slice(0,10)];
}
