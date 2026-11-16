import { Card, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <Card>
      <SkeletonRows rows={6} />
    </Card>
  );
}
