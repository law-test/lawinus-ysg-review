const retry = new URL(import.meta.url).search;
await import('./pdf.compat.mjs' + retry);
const { WorkerMessageHandler } = await import('./pdf.worker.mjs' + retry);
// PDF.js also imports this export if the browser cannot start a module worker.
export { WorkerMessageHandler };
