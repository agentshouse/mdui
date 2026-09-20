import { connectHouseBridge } from '@agentshouse/app-bridge';
import { connectMdRuntime } from '@agentshouse/mdruntime/client';
import { bindApp } from './app.js';
import './components/fields.js';
import './components/markdown.js';
import './components/view.js';
import './components/status.js';
export { bindApp };

export async function connectApp() {
  const bridge = connectHouseBridge();
  return bindApp(connectMdRuntime(await bridge.runtime));
}

if (Object.hasOwn(globalThis, 'houseBridge')) void connectApp();
