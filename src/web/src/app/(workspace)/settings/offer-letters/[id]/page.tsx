import { OfferLetterEditor } from '@/features/offer-letters/OfferLetters';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <OfferLetterEditor id={(await params).id} />;
}
