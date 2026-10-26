import { createContext, useContext, type MutableRefObject } from 'react';
import { DEFAULT_EYE_HEIGHT } from '../../../shared/avatar.ts';

export type EyeHeight = { current: number; target: number; seatOffset?: number };
export const EyeHeightContext = createContext<MutableRefObject<EyeHeight>>({ current: { current: DEFAULT_EYE_HEIGHT, target: DEFAULT_EYE_HEIGHT } });
export const useEyeHeight = () => useContext(EyeHeightContext);
