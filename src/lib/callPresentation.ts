import type { DemoCall } from '../types.js';
import { callRisk } from './callRisk.js';
export function callRiskLabel(call: DemoCall, _compactNewCustomer = false): string { return callRisk(call).text; }
