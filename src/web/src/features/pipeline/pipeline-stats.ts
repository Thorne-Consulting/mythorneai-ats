import type { BoardData } from '@/types';

export type BoardStage = BoardData['stages'][number];
export type ApplicantRow = BoardStage['applications'][number] & {
  stageId: string;
  stageName: string;
};

/** Every active applicant on a board, with the stage they sit in. */
export function flattenBoard(stages: BoardStage[]): ApplicantRow[] {
  return stages.flatMap((s) =>
    s.applications.map((a) => ({ ...a, stageId: s.id, stageName: s.name })),
  );
}

/** Per stage: how many sit in it, and how many have reached it (are in it or any later stage). */
export function stageFunnel(stages: { id: string; name: string; applications: unknown[] }[]) {
  const counts = stages.map((s) => s.applications.length);
  return stages.map((s, i) => ({
    id: s.id,
    name: s.name,
    count: counts[i],
    reached: counts.slice(i).reduce((sum, n) => sum + n, 0),
  }));
}

/** Search used by the board and the list: name, current title or a skill. */
export function matchesApplicant(
  app: { candidateName: string; currentTitle?: string; skills: string[] },
  query: string,
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    app.candidateName.toLowerCase().includes(q) ||
    !!app.currentTitle?.toLowerCase().includes(q) ||
    app.skills.some((skill) => skill.toLowerCase().includes(q))
  );
}
