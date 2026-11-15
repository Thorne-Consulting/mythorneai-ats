import { OfferPage } from '@/features/candidate-portal/offer/OfferPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OfferPage applicationId={(await params).id} />;
}
