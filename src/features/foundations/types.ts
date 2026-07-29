import type {
  FoundationLandmarkGroup,
  FoundationType,
} from "../../domain/document/types";

export type FoundationView = "front" | "side" | "back";

export type FoundationAsset = Readonly<{
  id: string;
  version: number;
  name: string;
  foundationType: FoundationType;
  view: FoundationView;
  sourceUrl: string;
  viewBox: Readonly<{ x: 0; y: 0; width: 2480; height: 3508 }>;
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  centerLineX: number;
  groups: readonly Readonly<{
    id: FoundationLandmarkGroup;
    label: string;
    symbolId: string;
    defaultVisible: boolean;
  }>[];
}>;
