import { parseTaskInput, type Task } from '../shared/domain';

const gatewayUrl = process.env.AI_GATEWAY_URL;

export async function parseTasksWithGateway(rawText: string): Promise<Task[]> {
  if (!gatewayUrl) return parseTaskInput(rawText);
  try {
    const response = await fetch(`${gatewayUrl.replace(/\/$/, '')}/parse_tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawText }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`AI gateway returned ${response.status}`);
    const data = await response.json() as { tasks?: Task[] };
    return data.tasks?.length ? data.tasks : parseTaskInput(rawText);
  } catch {
    return parseTaskInput(rawText);
  }
}
