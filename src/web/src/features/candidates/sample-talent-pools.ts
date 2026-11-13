// Sample data for the Talent pools preview. There is no pools backend yet; every owner is fictional.
// Replace with a query when /api/talent-pools exists, and delete the Preview badge.

export type TalentPool = {
  id: string;
  name: string;
  description: string;
  members: number;
  owner: string;
  /** People added in the last 30 days. */
  addedRecently: number;
  updatedAt: string;
};

export const sampleTalentPools: TalentPool[] = [
  {
    id: 'p1',
    name: 'Silver medallists',
    description: 'Reached the final round, not hired. First call when a similar job opens.',
    members: 38,
    owner: 'Priya Natarajan',
    addedRecently: 4,
    updatedAt: '2026-11-10T15:20:00Z',
  },
  {
    id: 'p2',
    name: 'Frontend engineers, Chicago',
    description: 'React and TypeScript people within commuting distance of the Chicago office.',
    members: 61,
    owner: 'Marcus Lee',
    addedRecently: 9,
    updatedAt: '2026-11-08T09:05:00Z',
  },
  {
    id: 'p3',
    name: 'Campus 2027',
    description: 'Graduating students met at university fairs this autumn.',
    members: 112,
    owner: 'Hannah Okafor',
    addedRecently: 27,
    updatedAt: '2026-11-12T17:40:00Z',
  },
  {
    id: 'p4',
    name: 'Boomerangs',
    description: 'Former employees who left on good terms and said they would come back.',
    members: 17,
    owner: 'Priya Natarajan',
    addedRecently: 1,
    updatedAt: '2026-10-29T11:00:00Z',
  },
  {
    id: 'p5',
    name: 'Data leadership',
    description: 'Heads of data and analytics managers for future leadership openings.',
    members: 23,
    owner: 'Marcus Lee',
    addedRecently: 0,
    updatedAt: '2026-10-15T08:30:00Z',
  },
];
