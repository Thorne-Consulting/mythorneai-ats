// Side-by-side layout for overlapping calendar events, the way Google Calendar does it: events that
// overlap (directly or through a chain) form a cluster; each takes the first free column, and every
// event in the cluster shares the cluster's column count.

export type Timed = { id: string; start: Date; end: Date };
export type Placement = { column: number; columns: number };

export function layoutEvents(events: Timed[]): Map<string, Placement> {
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime(),
  );
  const result = new Map<string, Placement>();
  let cluster: { id: string; column: number }[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const item of cluster)
      result.set(item.id, { column: item.column, columns: columnsEnd.length });
    cluster = [];
    columnsEnd = [];
  };
  for (const event of sorted) {
    const start = event.start.getTime();
    const end = Math.max(event.end.getTime(), start + 1);
    if (start >= clusterEnd) close();
    let column = columnsEnd.findIndex((free) => free <= start);
    if (column === -1) column = columnsEnd.push(end) - 1;
    else columnsEnd[column] = end;
    cluster.push({ id: event.id, column });
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  close();
  return result;
}
