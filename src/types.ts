import * as THREE from 'three';

export type ToolCategory = 'storage' | 'gridfinity' | 'wall' | 'desk';

export type ToolId =
  | 'divided-box-pro'
  | 'gridfinity-bin'
  | 'gridfinity-baseplate'
  | 'opengrid-board'
  | 'wall-hook-holder'
  | 'desk-organizer-tray';

export type ParamType = 'number' | 'select' | 'boolean';

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  key: string;
  label: string;
  shortLabel?: string;
  group: 'basic' | 'advanced';
  type: ParamType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ParamOption[];
  defaultValue: number | string | boolean;
  description?: string;
}

export type ParamValues = Record<string, number | string | boolean>;

export interface InnerDimensionSpec {
  label: string;
  width: number;
  depth: number;
  height: number;
  yBottom: number;
  yTop: number;
  centerX?: number;
  centerZ?: number;
}

export interface ComputedMetrics {
  outerW: number;
  outerD: number;
  outerH: number;
  innerBox?: InnerDimensionSpec;
  summaryLines: string[];
  estimatedFilamentGrams: number;
  estimatedPrintMinutes: number;
}

export interface GeneratedModel {
  geometry: THREE.BufferGeometry;
  metrics: ComputedMetrics;
  warnings: string[];
}

export interface MaterialSuitability {
  name: string;
  rating: '◎' | '〇' | '△' | '✕';
  note?: string;
}

export interface PrintProfile {
  supports: string;
  nozzle: string;
  layerHeight: string;
  infill: string;
  materials: MaterialSuitability[];
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  subtitle: string;
  category: ToolCategory;
  categoryLabel: string;
  badge?: string;
  description: string;
  svgIcon: string;
  params: ParamDef[];
  printProfile: PrintProfile;
  supportsCellMerge?: boolean;
  generate: (params: ParamValues, mergedWalls: Set<string>) => GeneratedModel;
}

export interface ProjectMetadata {
  app: 'parametric-3d-studio';
  version: 1;
  toolId: ToolId;
  params: ParamValues;
  mergedWalls: string[];
  exportedAt: string;
}
