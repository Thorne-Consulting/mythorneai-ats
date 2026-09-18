import type { ApplicationDetailResponse } from '@/types';

export type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };
export type Interview = ApplicationDetailResponse['application']['interviews'][number];
