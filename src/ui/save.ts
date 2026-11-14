/** The claude.ai viewer's capability bridge, present only when the game runs as a published page. */
interface ClaudeBridge {
  use(name: 'downloads'): Promise<{ save(req: { filename: string; data: Blob | string }): Promise<{ status: string }> } | null>;
}

/**
 * Hand a generated file to the player. Inside a published claude.ai page the viewer asks
 * before saving (downloads started by the page itself are blocked there); everywhere else —
 * the desktop program, the HTML file, a normal web host — the browser's own download is used.
 * Resolves false when the player declined or saving is not possible.
 */
export async function saveFile(filename: string, data: Blob | string, type = 'application/octet-stream'): Promise<boolean> {
  const bridge = (window as unknown as { claude?: ClaudeBridge }).claude;
  if (bridge?.use) {
    try {
      const downloads = await bridge.use('downloads');
      if (downloads) {
        await downloads.save({ filename, data });
        return true;
      }
    } catch {
      return false;
    }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
