type ExportItem = Record<string, unknown> & {
  id: string;
  location?: string;
  note?: string;
  user?: string;
};

type DailyItem = {
  contractId: string;
  personName: string;
  day: string;
  workedMinutes: number;
  totalDurationMinutes: number;
  clockRecordsCount: number;
  stampingLocations: string[];
  entryLocation: string;
  entryTime: string;
  exitLocation: string;
  exitTime: string;
  plannedShift?: string;
  plannedLocation?: string;
};

export function generateMockExports(count: number): ExportItem[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, count) : 10;
  return Array.from({ length: safeCount }).map((_, idx) => ({
    id: `mock-${idx + 1}`,
    date: new Date(Date.now() - idx * 3600 * 1000).toISOString(),
    user: idx % 2 === 0 ? "Mario Rossi" : "Anna Verdi",
    location: idx % 3 === 0 ? "Milano HQ" : "Cantiere Nord",
    note: idx % 2 === 0 ? "Turno mattina" : "Turno pomeriggio",
    direction: idx % 2 === 0 ? "IN" : "OUT",
  }));
}

export function generateMockDailySummary(date: string, count: number): DailyItem[] {
  const safeCount = Number.isFinite(count) ? Math.max(1, count) : 10;
  return Array.from({ length: safeCount }).map((_, idx) => ({
    contractId: `contract-${idx + 1}`,
    personName: idx % 2 === 0 ? "Mario Rossi" : "Anna Verdi",
    day: date,
    workedMinutes: 420 + (idx % 3) * 30,
    totalDurationMinutes: 420 + (idx % 3) * 30,
    clockRecordsCount: 2,
    stampingLocations: ["Milano HQ", "Cantiere Nord"].slice(0, (idx % 2) + 1),
    entryLocation: "Milano HQ",
    entryTime: "09:00:00",
    exitLocation: "Milano HQ",
    exitTime: "17:30:00",
    plannedShift: "Turno standard",
    plannedLocation: idx % 2 === 0 ? "Milano HQ" : "Cantiere Nord",
  }));
}

export function generateMockContracts() {
  return [
    { id: "c1", first_name: "Mario", last_name: "Rossi", email: "mario@example.com" },
    { id: "c2", first_name: "Anna", last_name: "Verdi", email: "anna@example.com" },
  ];
}
