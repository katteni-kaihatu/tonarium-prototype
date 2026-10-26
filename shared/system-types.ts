export type SystemValue = string | number | boolean | null;
export type ValueType = 'number' | 'string' | 'boolean' | 'user' | 'object';
export type Capability = 'interact' | 'move' | 'text' | 'seat';
export type Vector3 = [number, number, number];
export interface ValueSchema { type: ValueType; default: SystemValue; min?: number; max?: number }
export interface SystemTarget { capabilities: Capability[]; required: boolean; multiple?: boolean }
export interface SystemPort { payload: Record<string, ValueType> }
export type Expression = SystemValue | { state: string } | { config: string } | { event: string } | { actor: true } | { now: true } | { calc: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' | 'eq' | 'gt' | 'not' | 'ceil' | 'clock'; args: Expression[] };
export type SystemAction =
  | { op: 'set'; field: string; value: Expression }
  | { op: 'emit'; port: string; payload: Record<string, Expression> }
  | { op: 'if'; condition: Expression; then: SystemAction[]; else?: SystemAction[] }
  | { op: 'move'; target: string; offset: [Expression, Expression, Expression] }
  | { op: 'text'; target: string; value: Expression }
  | { op: 'schedule'; key: string; delayMs: Expression; input: string; payload: Record<string, Expression> }
  | { op: 'cancel'; key: string }
  | { op: 'seat'; target: string; user: Expression }
  | { op: 'unseat'; user: Expression };
export interface SystemMigration { from: string; renameState?: Record<string, string> }
export interface SystemManifest {
  schema: 1; sdk: 'tonarium-systems/1'; id: string; version: string; title: string; description: string;
  license: string; credits: string[];
  targets: Record<string, SystemTarget>; config: Record<string, ValueSchema>; state: Record<string, ValueSchema>;
  inputs: Record<string, SystemPort>; outputs: Record<string, SystemPort>;
  handlers: Record<string, SystemAction[]>;
  interaction?: { target: string; input: string };
  migrations?: SystemMigration[];
}
export interface SystemEntry { id: string; version: string; integrity: string; manifest: SystemManifest }
export interface SystemCatalog { schema: 1; commit: string; entries: SystemEntry[] }
export interface SystemObject {
  id: string; capabilities: Capability[]; position: Vector3; rotation?: number;
  size?: Vector3; color?: string; text?: string; solid?: boolean; seatOffset?: Vector3;
  itemId?: string; itemMode?: 'native' | 'system';
}
export type SystemItemPlacement = Omit<SystemObject, 'capabilities' | 'itemId'> & { itemId: string; capabilities?: Capability[] };
export interface SystemInstance {
  instanceId: string; systemId: string; bindings: Record<string, string[]>; config: Record<string, SystemValue>;
}
export interface SystemConnection { from: string; output: string; to: string; input: string; mapping?: Record<string, string> }
export interface SystemMap { schema: 1; id: string; objects: SystemObject[]; systems: SystemInstance[]; connections: SystemConnection[] }
export interface ResolvedSystem extends SystemInstance { version: string; integrity: string; state: Record<string, SystemValue> }
export interface SystemSchedule { instanceId: string; key: string; due: number; input: string; payload: Record<string, SystemValue>; actor: string }
export interface SystemTrace { instanceId: string; event: string; actor: string; at: number }
export interface SystemRuntimeState {
  revision: number; map: SystemMap; systems: ResolvedSystem[];
  objects: Record<string, { position: Vector3; text?: string }>;
  seats: Record<string, string>; schedules: SystemSchedule[];
  commands: { id: string; actor: string; body: string }[];
  diagnostics: string[]; traces: SystemTrace[];
}
export type SystemCommand = { id: string; revision: number } & (
  | { kind: 'map'; map: SystemMap }
  | { kind: 'input'; instanceId: string; input: string; payload: Record<string, SystemValue> }
  | { kind: 'interact'; objectId: string }
);
export type SystemView = Omit<SystemRuntimeState, 'commands' | 'schedules'>;
export interface SystemCommandResult { id: string; outcome: 'applied' | 'duplicate' | 'rejected' }
