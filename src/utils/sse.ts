export async function* readSseJsonStream<T = any>(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      yield JSON.parse(payload) as T;
    }
  }

  if (buffer.startsWith('data: ')) {
    const payload = buffer.slice(6).trim();
    if (payload) {
      yield JSON.parse(payload) as T;
    }
  }
}
